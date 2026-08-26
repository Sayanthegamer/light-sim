import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WebGpuComputeDispatcher,
  type DispatcherState
} from '../../src/engine/offline/gpu/webgpuComputeDispatcher';
import { type IOfflineRenderJob } from '../../src/engine/offline/sceneSnapshot';
import { WebGpuContext } from '../../src/engine/offline/gpu/webgpuContext';

describe('WebGPU Compute Dispatcher & Lifecycle State Machine', () => {
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
        getMappedRange: vi.fn().mockReturnValue(new Float32Array(100 * 100 * 4).buffer),
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

  it('initializes in IDLE state', () => {
    const dispatcher = new WebGpuComputeDispatcher(async () => mockContext);
    expect(dispatcher.getState()).toBe('IDLE');
    expect(dispatcher.getPassCount()).toBe(0);
  });

  it('runs job, updates progress, and transitions through RUNNING and COMPLETE states', async () => {
    const dispatcher = new WebGpuComputeDispatcher(async () => mockContext);

    const job: IOfflineRenderJob = {
      jobId: 'job_test_1',
      width: 100,
      height: 100,
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
        batchPhotons: 1000,
        volumetricInScatter: false
      }
    };

    const progressReports: number[] = [];
    let isFinished = false;

    await new Promise<void>((resolve) => {
      dispatcher.start(
        job,
        (p) => {
          progressReports.push(p.pass);
        },
        (_buf, _sampleMap, _elapsed) => {
          isFinished = true;
          resolve();
        }
      );
    });

    expect(dispatcher.getState()).toBe('COMPLETE');
    expect(isFinished).toBe(true);
    expect(progressReports.length).toBeGreaterThan(0);
  });

  it('supports pause and resume state transitions', async () => {
    const dispatcher = new WebGpuComputeDispatcher(async () => mockContext);

    const job: IOfflineRenderJob = {
      jobId: 'job_test_2',
      width: 100,
      height: 100,
      scene: {
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
        emitters: [{ id: 1, pos: { x: 10, y: 10 }, dir: { x: 1, y: 0 }, width: 5, spectrumType: 'monochromatic', spectrumParam: 500, power: 1 }],
        prisms: [],
        lenses: [],
        barriers: [],
        blackHoles: []
      },
      config: {
        targetSamples: 100,
        batchPhotons: 1000,
        volumetricInScatter: false
      }
    };

    dispatcher.start(job, vi.fn(), vi.fn());
    // Allow start initialization
    await new Promise(r => setTimeout(r, 10));

    expect(dispatcher.getState()).toBe('RUNNING');
    dispatcher.pause();
    expect(dispatcher.getState()).toBe('PAUSED');
    dispatcher.resume();
    expect(dispatcher.getState()).toBe('RUNNING');
    dispatcher.cancel();
    expect(dispatcher.getState()).toBe('CANCELLED');
  });

  it('handles device acquisition failure by invoking onError callback and setting ERROR state', async () => {
    const failingDispatcher = new WebGpuComputeDispatcher(async () => null);
    const onError = vi.fn();

    const job: IOfflineRenderJob = {
      jobId: 'job_test_3',
      width: 100,
      height: 100,
      scene: { bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, emitters: [], prisms: [], lenses: [], barriers: [], blackHoles: [] },
      config: { targetSamples: 10, batchPhotons: 1000, volumetricInScatter: false }
    };

    failingDispatcher.start(job, vi.fn(), vi.fn(), onError);
    await new Promise(r => setTimeout(r, 10));

    expect(failingDispatcher.getState()).toBe('ERROR');
    expect(onError).toHaveBeenCalled();
  });
});
