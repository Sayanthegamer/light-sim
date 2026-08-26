import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GpuAccumulator } from '../../src/engine/offline/gpu/gpuAccumulator';
import { GpuPipelineManager } from '../../src/engine/offline/gpu/webgpuPipeline';
import { type IOfflineSceneGeometry } from '../../src/engine/offline/mcPhotonTracer';

describe('GPU Progressive Accumulator & Texture Readback', () => {
  let mockDevice: GPUDevice;
  let mockTexture: GPUTexture;
  let mockStagingBuffer: GPUBuffer;
  let mockCommandEncoder: GPUCommandEncoder;
  let mockRenderPass: GPURenderPassEncoder;

  beforeEach(() => {
    mockRenderPass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      draw: vi.fn(),
      end: vi.fn()
    } as unknown as GPURenderPassEncoder;

    mockCommandEncoder = {
      beginRenderPass: vi.fn().mockReturnValue(mockRenderPass),
      beginComputePass: vi.fn().mockReturnValue({
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        dispatchWorkgroups: vi.fn(),
        end: vi.fn()
      }),
      copyTextureToBuffer: vi.fn(),
      finish: vi.fn().mockReturnValue({})
    } as unknown as GPUCommandEncoder;

    mockStagingBuffer = {
      mapAsync: vi.fn().mockResolvedValue(undefined),
      getMappedRange: vi.fn().mockReturnValue(new Uint16Array(100 * 100 * 4).buffer),
      unmap: vi.fn(),
      destroy: vi.fn()
    } as unknown as GPUBuffer;

    mockTexture = {
      createView: vi.fn().mockReturnValue({}),
      destroy: vi.fn()
    } as unknown as GPUTexture;

    mockDevice = {
      createShaderModule: vi.fn().mockReturnValue({}),
      createComputePipeline: vi.fn().mockReturnValue({ getBindGroupLayout: vi.fn().mockReturnValue({}) }),
      createRenderPipeline: vi.fn().mockReturnValue({ getBindGroupLayout: vi.fn().mockReturnValue({}) }),
      createTexture: vi.fn().mockReturnValue(mockTexture),
      createBuffer: vi.fn().mockReturnValue(mockStagingBuffer),
      createBindGroup: vi.fn().mockReturnValue({}),
      createCommandEncoder: vi.fn().mockReturnValue(mockCommandEncoder),
      queue: {
        writeBuffer: vi.fn(),
        submit: vi.fn()
      }
    } as unknown as GPUDevice;
  });

  it('initializes GpuAccumulator and allocates textures for target dimensions', () => {
    const accumulator = new GpuAccumulator(mockDevice, 800, 600);
    expect(accumulator.width).toBe(800);
    expect(accumulator.height).toBe(600);
    expect(mockDevice.createTexture).toHaveBeenCalledWith(expect.objectContaining({
      format: 'rgba16float',
      size: [800, 600, 1]
    }));
    expect(accumulator.getPassCount()).toBe(0);
  });

  it('records compute dispatch and additive render pass into command encoder', () => {
    const accumulator = new GpuAccumulator(mockDevice, 800, 600);
    const pipelineMgr = new GpuPipelineManager(mockDevice);

    const scene: IOfflineSceneGeometry = {
      bounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 },
      emitters: [{ id: 1, pos: { x: 10, y: 10 }, dir: { x: 1, y: 0 }, width: 10, spectrumType: 'monochromatic', spectrumParam: 500, power: 1 }],
      prisms: [],
      lenses: [],
      barriers: [],
      blackHoles: []
    };

    pipelineMgr.updateScene(scene, 10000);

    accumulator.renderPass(pipelineMgr);
    expect(mockCommandEncoder.beginComputePass).toHaveBeenCalled();
    expect(mockCommandEncoder.beginRenderPass).toHaveBeenCalled();
    expect(mockRenderPass.draw).toHaveBeenCalled();
    expect(mockDevice.queue.submit).toHaveBeenCalled();
    expect(accumulator.getPassCount()).toBe(1);
  });

  it('resets accumulation pass count and clears render target on reset()', () => {
    const accumulator = new GpuAccumulator(mockDevice, 800, 600);
    accumulator.reset();
    expect(accumulator.getPassCount()).toBe(0);
  });

  it('destroys allocated textures and staging buffers cleanly', () => {
    const accumulator = new GpuAccumulator(mockDevice, 800, 600);
    accumulator.destroy();
    expect(mockTexture.destroy).toHaveBeenCalled();
    expect(mockStagingBuffer.destroy).toHaveBeenCalled();
  });

  it('performs asynchronous readback of rgba16float and rgba32float buffers', async () => {
    const accumulator16 = new GpuAccumulator(mockDevice, 100, 100, 'rgba16float');
    const readback16 = await accumulator16.readbackToFloat32Array();
    expect(readback16).toBeInstanceOf(Float32Array);
    expect(readback16.length).toBe(100 * 100 * 4);

    mockStagingBuffer.getMappedRange = vi.fn().mockReturnValue(new Float32Array(100 * 100 * 4).buffer);
    const accumulator32 = new GpuAccumulator(mockDevice, 100, 100, 'rgba32float');
    const readback32 = await accumulator32.readbackToFloat32Array();
    expect(readback32).toBeInstanceOf(Float32Array);
    expect(readback32.length).toBe(100 * 100 * 4);
  });

  it('correctly decodes IEEE 754 half-precision float16 values', async () => {
    const { decodeFloat16 } = await import('../../src/engine/offline/gpu/gpuAccumulator');
    expect(decodeFloat16(0x0000)).toBe(0);
    expect(decodeFloat16(0x3C00)).toBe(1.0);
    expect(decodeFloat16(0x4000)).toBe(2.0);
    expect(decodeFloat16(0x7C00)).toBe(Infinity);
    expect(decodeFloat16(0x0200)).toBeGreaterThan(0); // Subnormal
  });
});
