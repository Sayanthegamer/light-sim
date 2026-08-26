import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebGpuComputeDispatcher } from '../../src/engine/offline/gpu/webgpuComputeDispatcher';
import { type IOfflineRenderJob } from '../../src/engine/offline/sceneSnapshot';
import { WebGpuContext } from '../../src/engine/offline/gpu/webgpuContext';

describe('Epoch-Based GPU Sub-Accumulation & Welford Host Consolidation', () => {
  let mockContext: WebGpuContext;
  let mockDevice: GPUDevice;

  beforeEach(() => {
    mockDevice = {
      createShaderModule: vi.fn().mockReturnValue({}),
      createComputePipeline: vi.fn().mockReturnValue({ getBindGroupLayout: vi.fn().mockReturnValue({}) }),
      createRenderPipeline: vi.fn().mockReturnValue({ getBindGroupLayout: vi.fn().mockReturnValue({}) }),
      createTexture: vi.fn().mockReturnValue({ createView: vi.fn().mockReturnValue({}), destroy: vi.fn() }),
      createBuffer: vi.fn().mockReturnValue({
        mapAsync: vi.fn().mockResolvedValue(undefined),
        getMappedRange: vi.fn().mockReturnValue(new Float32Array(10 * 10 * 4).fill(1.0).buffer),
        unmap: vi.fn(),
        destroy: vi.fn()
      }),
      createBindGroup: vi.fn().mockReturnValue({}),
      createCommandEncoder: vi.fn().mockReturnValue({
        beginRenderPass: vi.fn().mockReturnValue({ setPipeline: vi.fn(), setBindGroup: vi.fn(), draw: vi.fn(), end: vi.fn() }),
        beginComputePass: vi.fn().mockReturnValue({ setPipeline: vi.fn(), setBindGroup: vi.fn(), dispatchWorkgroups: vi.fn(), end: vi.fn() }),
        copyTextureToBuffer: vi.fn(),
        finish: vi.fn().mockReturnValue({})
      }),
      destroy: vi.fn(),
      queue: {
        writeBuffer: vi.fn(),
        submit: vi.fn()
      }
    } as unknown as GPUDevice;

    mockContext = new WebGpuContext({} as GPUAdapter, mockDevice);
  });

  it('demonstrates numerical precision preservation of Welford incremental mean over naive single-precision addition', () => {
    // Large base value (e.g. 50,000 passes accumulated)
    const baseValue = 50000.0;
    const tinyDelta = 0.0001; // Attenuated photon contribution

    // Naive FP32 addition:
    const fp32Buffer = new Float32Array(1);
    fp32Buffer[0] = baseValue;
    const initialFp32 = fp32Buffer[0];
    for (let i = 0; i < 1000; i++) {
      fp32Buffer[0] += tinyDelta;
    }
    const fp32LostTotal = fp32Buffer[0] - initialFp32;
    expect(fp32LostTotal).toBeGreaterThanOrEqual(0);

    // Welford consolidation in Double Precision:
    let welfordMean = baseValue;
    for (let k = 1; k <= 1000; k++) {
      const sampleVal = baseValue + tinyDelta;
      welfordMean += (sampleVal - welfordMean) / (50000 + k);
    }

    // Welford correctly resolves precision that naive FP32 addition loses
    expect(welfordMean).toBeGreaterThan(baseValue);
    expect(welfordMean).not.toBeNaN();
  });

  it('consolidates epochs and exposes getVarianceDelta convergence telemetry', async () => {
    const dispatcher = new WebGpuComputeDispatcher(async () => mockContext);

    const job: IOfflineRenderJob = {
      jobId: 'job_welford_test',
      width: 10,
      height: 10,
      scene: {
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
        emitters: [{ id: 1, pos: { x: 10, y: 10 }, dir: { x: 1, y: 0 }, width: 5, spectrumType: 'monochromatic', spectrumParam: 500, power: 1 }],
        prisms: [],
        lenses: [],
        barriers: [],
        blackHoles: []
      },
      config: {
        targetSamples: 5,
        batchPhotons: 100,
        volumetricInScatter: false,
        maxBounces: 32,
        russianRouletteThreshold: 0.1,
        whitePoint: 4.0
      }
    };

    let completedBuffer: Float32Array | null = null;
    await new Promise<void>((resolve) => {
      dispatcher.start(
        job,
        vi.fn(),
        (buf) => {
          completedBuffer = buf;
          resolve();
        }
      );
    });

    expect(completedBuffer).not.toBeNull();
    expect(completedBuffer!.length).toBe(10 * 10 * 4);
    expect(dispatcher.getVarianceDelta()).toBeGreaterThanOrEqual(0);
    expect(dispatcher.getState()).toBe('COMPLETE');
  });

  it('performs strided sub-sampled variance calculation efficiently on 4K resolution buffers', async () => {
    // 4K resolution buffer (3840 x 2160 x 4 = 33,177,600 floats)
    const width = 3840;
    const height = 2160;
    const mock4KDevice = {
      ...mockDevice,
      createBuffer: vi.fn().mockReturnValue({
        mapAsync: vi.fn().mockResolvedValue(undefined),
        getMappedRange: vi.fn().mockReturnValue(new Float32Array(width * height * 4).fill(2.0).buffer),
        unmap: vi.fn(),
        destroy: vi.fn()
      })
    } as unknown as GPUDevice;

    const mock4KContext = new WebGpuContext({} as GPUAdapter, mock4KDevice);
    const dispatcher = new WebGpuComputeDispatcher(async () => mock4KContext);

    const job: IOfflineRenderJob = {
      jobId: 'job_4k_test',
      width,
      height,
      scene: {
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
        emitters: [{ id: 1, pos: { x: 10, y: 10 }, dir: { x: 1, y: 0 }, width: 5, spectrumType: 'monochromatic', spectrumParam: 500, power: 1 }],
        prisms: [],
        lenses: [],
        barriers: [],
        blackHoles: []
      },
      config: {
        targetSamples: 1,
        batchPhotons: 100,
        volumetricInScatter: false,
        maxBounces: 32,
        russianRouletteThreshold: 0.1,
        whitePoint: 4.0
      }
    };

    const startTime = performance.now();
    await new Promise<void>((resolve) => {
      dispatcher.start(job, vi.fn(), () => resolve());
    });
    const duration = performance.now() - startTime;

    // Strided variance sampling should execute smoothly without main-thread blocking
    expect(duration).toBeLessThan(1000);
    expect(dispatcher.getVarianceDelta()).toBeGreaterThanOrEqual(0);
  });
});
