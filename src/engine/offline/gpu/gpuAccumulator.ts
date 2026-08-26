/**
 * GPU Accumulator & Framebuffer Readback Manager
 *
 * Manages offscreen floating-point HDR accumulation textures (rgba16float / rgba32float),
 * coordinates Compute-to-Raster frame execution, and provides asynchronous staging readback
 * into master Float32Array buffers.
 */

import { GpuPipelineManager, BufferUsage } from './webgpuPipeline';

export const TextureUsage = {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  STORAGE_BINDING: 0x08,
  RENDER_ATTACHMENT: 0x10
};

export class GpuAccumulator {
  readonly device: GPUDevice;
  readonly width: number;
  readonly height: number;
  readonly format: GPUTextureFormat;

  private accumulationTexture: GPUTexture | null = null;
  private accumulationView: GPUTextureView | null = null;
  private stagingBuffer: GPUBuffer | null = null;
  private passCount = 0;
  private needsClear = true;
  private readbackArray: Float32Array;

  constructor(device: GPUDevice, width: number, height: number, format: GPUTextureFormat = 'rgba16float') {
    this.device = device;
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.format = format;
    this.readbackArray = new Float32Array(this.width * this.height * 4);

    this.initBuffers();
  }

  getPassCount(): number {
    return this.passCount;
  }

  private initBuffers(): void {
    this.accumulationTexture = this.device.createTexture({
      label: 'GpuAccumulationTexture',
      size: [this.width, this.height, 1],
      format: this.format,
      usage: TextureUsage.RENDER_ATTACHMENT | TextureUsage.COPY_SRC | TextureUsage.TEXTURE_BINDING
    });

    this.accumulationView = this.accumulationTexture.createView();

    // Bytes per row must be aligned to 256 bytes in WebGPU
    const bytesPerPixel = this.format === 'rgba32float' ? 16 : 8;
    const unalignedBytesPerRow = this.width * bytesPerPixel;
    const bytesPerRow = Math.ceil(unalignedBytesPerRow / 256) * 256;
    const stagingBufferSize = bytesPerRow * this.height;

    this.stagingBuffer = this.device.createBuffer({
      label: 'GpuAccumulationStagingBuffer',
      size: stagingBufferSize,
      usage: BufferUsage.MAP_READ | BufferUsage.COPY_DST
    });
  }

  /**
   * Dispatches photon compute shader and rasterizes lines into accumulation target.
   */
  renderPass(pipelineMgr: GpuPipelineManager, maxBounces = 32): void {
    const computePipeline = pipelineMgr.getComputePipeline();
    const renderPipeline = pipelineMgr.getRenderPipeline();
    const computeBindGroup = pipelineMgr.getComputeBindGroup();
    const renderBindGroup = pipelineMgr.getRenderBindGroup();

    if (!computePipeline || !renderPipeline || !computeBindGroup || !renderBindGroup || !this.accumulationView) {
      return;
    }

    const commandEncoder = this.device.createCommandEncoder({
      label: 'GpuAccumulatorFrameEncoder'
    });

    // 1. Compute Pass: Generate Photon Trajectories
    const batchSize = pipelineMgr.getBatchSize();
    const workgroupCount = Math.ceil(batchSize / 64);

    const computePass = commandEncoder.beginComputePass({
      label: 'PhotonTransportComputePass'
    });
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(workgroupCount, 1, 1);
    computePass.end();

    // 2. Render Pass: Hardware Additive Rasterization
    const loadOp: GPULoadOp = this.needsClear ? 'clear' : 'load';
    this.needsClear = false;

    const renderPass = commandEncoder.beginRenderPass({
      label: 'ClipRasterRenderPass',
      colorAttachments: [
        {
          view: this.accumulationView,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp,
          storeOp: 'store'
        }
      ]
    });

    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, renderBindGroup);

    const totalVertices = batchSize * maxBounces * 2;
    renderPass.draw(totalVertices, 1, 0, 0);
    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);
    this.passCount++;
  }

  /**
   * Asynchronously reads back GPU accumulation texture data into a Float32Array.
   */
  async readbackToFloat32Array(): Promise<Float32Array> {
    if (!this.accumulationTexture || !this.stagingBuffer) {
      return this.readbackArray;
    }

    const bytesPerPixel = this.format === 'rgba32float' ? 16 : 8;
    const unalignedBytesPerRow = this.width * bytesPerPixel;
    const bytesPerRow = Math.ceil(unalignedBytesPerRow / 256) * 256;

    const commandEncoder = this.device.createCommandEncoder({ label: 'ReadbackEncoder' });
    commandEncoder.copyTextureToBuffer(
      { texture: this.accumulationTexture },
      { buffer: this.stagingBuffer, bytesPerRow, rowsPerImage: this.height },
      [this.width, this.height, 1]
    );

    this.device.queue.submit([commandEncoder.finish()]);

    try {
      const mode = typeof GPUMapMode !== 'undefined' ? GPUMapMode.READ : 1;
      await this.stagingBuffer.mapAsync(mode);
      const mappedRange = this.stagingBuffer.getMappedRange();

      if (this.format === 'rgba32float') {
        const floatView = new Float32Array(mappedRange);
        const strideFloats = bytesPerRow / 4;
        for (let y = 0; y < this.height; y++) {
          const srcRow = y * strideFloats;
          const dstRow = y * this.width * 4;
          for (let x = 0; x < this.width * 4; x++) {
            this.readbackArray[dstRow + x] = floatView[srcRow + x];
          }
        }
      } else {
        // rgba16float: decode half-float to single-precision float32
        const uint16View = new Uint16Array(mappedRange);
        const strideWords = bytesPerRow / 2;
        for (let y = 0; y < this.height; y++) {
          const srcRow = y * strideWords;
          const dstRow = y * this.width * 4;
          for (let x = 0; x < this.width * 4; x++) {
            this.readbackArray[dstRow + x] = decodeFloat16(uint16View[srcRow + x]);
          }
        }
      }

      this.stagingBuffer.unmap();
    } catch (err) {
      console.warn('GPU Accumulator readback failed:', err);
    }

    return this.readbackArray;
  }

  reset(): void {
    this.passCount = 0;
    this.needsClear = true;
    this.readbackArray.fill(0);
  }

  destroy(): void {
    try {
      this.accumulationTexture?.destroy();
      this.stagingBuffer?.destroy();
    } catch {}
    this.accumulationTexture = null;
    this.accumulationView = null;
    this.stagingBuffer = null;
  }
}

/**
 * Fast IEEE 754 Float16 (half-precision) to Float32 decoder.
 */
export function decodeFloat16(half: number): number {
  const sign = (half & 0x8000) ? -1 : 1;
  const exp = (half >> 10) & 0x1f;
  const mant = half & 0x3ff;

  if (exp === 0) {
    if (mant === 0) return sign * 0.0;
    return sign * Math.pow(2, -14) * (mant / 1024);
  }
  if (exp === 31) {
    return mant === 0 ? sign * Infinity : NaN;
  }
  return sign * Math.pow(2, exp - 15) * (1 + mant / 1024);
}
