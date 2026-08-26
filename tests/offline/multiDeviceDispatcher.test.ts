import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MultiDeviceDispatcher,
  type IDeviceDispatcher,
  type IDeviceProgress
} from '../../src/engine/offline/multiDeviceManager';
import { type IOfflineRenderJob } from '../../src/engine/offline/sceneSnapshot';

describe('MultiDeviceDispatcher & Dynamic Fallback Orchestration', () => {
  let mockJob: IOfflineRenderJob;

  beforeEach(() => {
    mockJob = {
      jobId: 'multidevice_job_1',
      width: 100,
      height: 100,
      scene: {
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
        emitters: [{ id: 1, pos: { x: 10, y: 10 }, dir: { x: 1, y: 0 }, width: 10, spectrumType: 'monochromatic', spectrumParam: 500, power: 1 }],
        prisms: [],
        lenses: [],
        barriers: [],
        blackHoles: []
      },
      config: {
        targetSamples: 10,
        batchPhotons: 1000,
        volumetricInScatter: false
      }
    };
  });

  it('routes to CPU dispatcher when device option is explicitly "cpu"', async () => {
    const mockCpuDispatcher: IDeviceDispatcher = {
      deviceType: 'cpu',
      start: vi.fn((job, onProgress, onComplete) => {
        onProgress({
          jobId: job.jobId,
          pass: 10,
          totalPasses: 10,
          photonsEmitted: 10000,
          photonsPerSec: 50000,
          elapsedMs: 200,
          renderedBuffer: new Float32Array(100 * 100 * 4),
          sampleCountMap: new Uint32Array(100 * 100)
        });
        onComplete(new Float32Array(100 * 100 * 4), new Uint32Array(100 * 100), 200);
      }),
      cancel: vi.fn()
    };

    const mockGpuDispatcher: IDeviceDispatcher = {
      deviceType: 'gpu',
      start: vi.fn(),
      cancel: vi.fn()
    };

    const multi = new MultiDeviceDispatcher({
      cpuDispatcher: mockCpuDispatcher,
      gpuDispatcher: mockGpuDispatcher
    });

    const onProgress = vi.fn();
    const onComplete = vi.fn();

    await multi.start(mockJob, 'cpu', onProgress, onComplete);

    expect(mockCpuDispatcher.start).toHaveBeenCalled();
    expect(mockGpuDispatcher.start).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
    expect(multi.getActiveDevice()).toBe('cpu');
  });

  it('routes to GPU dispatcher when device option is "gpu"', async () => {
    const mockCpuDispatcher: IDeviceDispatcher = {
      deviceType: 'cpu',
      start: vi.fn(),
      cancel: vi.fn()
    };

    const mockGpuDispatcher: IDeviceDispatcher = {
      deviceType: 'gpu',
      start: vi.fn((job, onProgress, onComplete) => {
        onProgress({
          jobId: job.jobId,
          pass: 10,
          totalPasses: 10,
          photonsEmitted: 100000,
          photonsPerSec: 5000000,
          elapsedMs: 20,
          renderedBuffer: new Float32Array(100 * 100 * 4),
          sampleCountMap: new Uint32Array(100 * 100)
        });
        onComplete(new Float32Array(100 * 100 * 4), new Uint32Array(100 * 100), 20);
      }),
      cancel: vi.fn()
    };

    const multi = new MultiDeviceDispatcher({
      cpuDispatcher: mockCpuDispatcher,
      gpuDispatcher: mockGpuDispatcher
    });

    const onProgress = vi.fn();
    const onComplete = vi.fn();

    await multi.start(mockJob, 'gpu', onProgress, onComplete);

    expect(mockGpuDispatcher.start).toHaveBeenCalled();
    expect(mockCpuDispatcher.start).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
    expect(multi.getActiveDevice()).toBe('gpu');
  });

  it('automatically falls back to CPU when GPU dispatcher fails in "auto" mode', async () => {
    const mockCpuDispatcher: IDeviceDispatcher = {
      deviceType: 'cpu',
      start: vi.fn((_job, _onProgress, onComplete) => {
        onComplete(new Float32Array(100 * 100 * 4), new Uint32Array(100 * 100), 300);
      }),
      cancel: vi.fn()
    };

    const mockGpuDispatcher: IDeviceDispatcher = {
      deviceType: 'gpu',
      start: vi.fn((_job, _onProgress, _onComplete, onError) => {
        if (onError) onError(new Error('GPU out of memory or device lost'));
      }),
      cancel: vi.fn()
    };

    const multi = new MultiDeviceDispatcher({
      cpuDispatcher: mockCpuDispatcher,
      gpuDispatcher: mockGpuDispatcher
    });

    const onComplete = vi.fn();
    await multi.start(mockJob, 'auto', vi.fn(), onComplete);

    expect(mockGpuDispatcher.start).toHaveBeenCalled();
    expect(mockCpuDispatcher.start).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
    expect(multi.getActiveDevice()).toBe('cpu');
  });

  it('delegates pause, resume, cancel, and destroy to the active dispatcher', async () => {
    const mockGpuDispatcher: IDeviceDispatcher = {
      deviceType: 'gpu',
      start: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
      destroy: vi.fn()
    };

    const mockCpuDispatcher: IDeviceDispatcher = {
      deviceType: 'cpu',
      start: vi.fn(),
      cancel: vi.fn(),
      destroy: vi.fn()
    };

    const multi = new MultiDeviceDispatcher({
      cpuDispatcher: mockCpuDispatcher,
      gpuDispatcher: mockGpuDispatcher
    });

    await multi.start(mockJob, 'gpu', vi.fn(), vi.fn());
    expect(multi.getActiveDispatcher()).toBe(mockGpuDispatcher);

    multi.pause();
    expect(mockGpuDispatcher.pause).toHaveBeenCalled();

    multi.resume();
    expect(mockGpuDispatcher.resume).toHaveBeenCalled();

    multi.cancel();
    expect(mockGpuDispatcher.cancel).toHaveBeenCalled();
    expect(multi.getActiveDispatcher()).toBeNull();

    multi.destroy();
    expect(mockCpuDispatcher.destroy).toHaveBeenCalled();
    expect(mockGpuDispatcher.destroy).toHaveBeenCalled();
  });

  it('tests CpuWorkerAdapter and GpuWorkerAdapter delegation', async () => {
    const { CpuWorkerAdapter, GpuWorkerAdapter } = await import('../../src/engine/offline/multiDeviceManager');

    const mockRenderDispatcher = {
      start: vi.fn((job, onProgress, onComplete) => {
        onProgress({
          jobId: job.jobId,
          pass: 1,
          totalPasses: 1,
          totalPhotons: 100,
          samplesPerSec: 1000,
          elapsedMs: 50,
          renderedBuffer: new Float32Array(100 * 100 * 4),
          sampleCountMap: new Uint32Array(100 * 100)
        });
        onComplete(new Float32Array(100 * 100 * 4), new Uint32Array(100 * 100), 50);
      }),
      cancel: vi.fn(),
      destroy: vi.fn()
    };

    const cpuAdapter = new CpuWorkerAdapter(mockRenderDispatcher as any);
    const onProgress = vi.fn();
    const onComplete = vi.fn();

    cpuAdapter.start(mockJob, onProgress, onComplete);
    expect(mockRenderDispatcher.start).toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ device: 'cpu' }));
    expect(onComplete).toHaveBeenCalled();
    cpuAdapter.cancel();
    expect(mockRenderDispatcher.cancel).toHaveBeenCalled();
    cpuAdapter.destroy();
    expect(mockRenderDispatcher.destroy).toHaveBeenCalled();

    const mockWebGpuDispatcher = {
      start: vi.fn(async (job, onProgress, onComplete) => {
        onProgress({
          jobId: job.jobId,
          pass: 1,
          totalPasses: 1,
          photonsEmitted: 100,
          photonsPerSec: 1000,
          elapsedMs: 50,
          renderedBuffer: new Float32Array(100 * 100 * 4),
          sampleCountMap: new Uint32Array(100 * 100)
        });
        onComplete(new Float32Array(100 * 100 * 4), new Uint32Array(100 * 100), 50);
      }),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
      destroy: vi.fn()
    };

    const gpuAdapter = new GpuWorkerAdapter(mockWebGpuDispatcher as any);
    await gpuAdapter.start(mockJob, onProgress, onComplete);
    expect(mockWebGpuDispatcher.start).toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ device: 'gpu' }));
    gpuAdapter.pause();
    expect(mockWebGpuDispatcher.pause).toHaveBeenCalled();
    gpuAdapter.resume();
    expect(mockWebGpuDispatcher.resume).toHaveBeenCalled();
    gpuAdapter.cancel();
    expect(mockWebGpuDispatcher.cancel).toHaveBeenCalled();
    gpuAdapter.destroy();
    expect(mockWebGpuDispatcher.destroy).toHaveBeenCalled();
  });
});
