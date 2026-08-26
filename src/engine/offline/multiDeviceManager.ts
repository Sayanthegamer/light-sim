/**
 * MultiDeviceDispatcher: Unified Multi-Engine Orchestrator
 *
 * Coordinates execution across CPU Multi-Threaded Workers, WebGPU Compute Shaders,
 * and handles resilient fallback routing.
 */

import {
  type IDeviceDispatcher,
  type IDeviceProgress,
  type DeviceType,
  type DeviceProgressCallback,
  type DeviceCompleteCallback,
  type DeviceErrorCallback
} from './deviceDispatcher';
import { type IOfflineRenderJob } from './sceneSnapshot';
import { RenderDispatcher } from './renderDispatcher';
import { WebGpuComputeDispatcher } from './gpu/webgpuComputeDispatcher';

export * from './deviceDispatcher';

export interface IMultiDeviceConfig {
  cpuDispatcher?: IDeviceDispatcher;
  gpuDispatcher?: IDeviceDispatcher;
}

export class MultiDeviceDispatcher {
  private cpuDispatcher: IDeviceDispatcher;
  private gpuDispatcher: IDeviceDispatcher;
  private activeDispatcher: IDeviceDispatcher | null = null;
  private activeDevice: DeviceType = 'cpu';

  constructor(config?: IMultiDeviceConfig) {
    this.cpuDispatcher = config?.cpuDispatcher ?? new CpuWorkerAdapter();
    this.gpuDispatcher = config?.gpuDispatcher ?? new GpuWorkerAdapter();
  }

  getActiveDevice(): DeviceType {
    return this.activeDevice;
  }

  getActiveDispatcher(): IDeviceDispatcher | null {
    return this.activeDispatcher;
  }

  async start(
    job: IOfflineRenderJob,
    targetDevice: DeviceType = 'auto',
    onProgress: DeviceProgressCallback,
    onComplete: DeviceCompleteCallback,
    onError?: DeviceErrorCallback
  ): Promise<void> {
    this.cancel();

    if (targetDevice === 'cpu') {
      this.activeDevice = 'cpu';
      this.activeDispatcher = this.cpuDispatcher;
      this.cpuDispatcher.start(
        job,
        (p) => onProgress({ ...p, device: 'cpu' }),
        onComplete,
        onError
      );
      return;
    }

    if (targetDevice === 'gpu') {
      this.activeDevice = 'gpu';
      this.activeDispatcher = this.gpuDispatcher;
      await this.gpuDispatcher.start(
        job,
        (p) => onProgress({ ...p, device: 'gpu' }),
        onComplete,
        onError
      );
      return;
    }

    // 'auto' mode: Attempt GPU first with seamless fallback to CPU
    this.activeDevice = 'gpu';
    this.activeDispatcher = this.gpuDispatcher;

    try {
      await this.gpuDispatcher.start(
        job,
        (p) => onProgress({ ...p, device: 'gpu' }),
        onComplete,
        (err) => {
          console.warn('Auto GPU dispatch failed, gracefully falling back to CPU workers:', err.message);
          this.activeDevice = 'cpu';
          this.activeDispatcher = this.cpuDispatcher;
          this.cpuDispatcher.start(
            job,
            (p) => onProgress({ ...p, device: 'cpu' }),
            onComplete,
            onError
          );
        }
      );
    } catch (err: any) {
      console.warn('Auto GPU exception, falling back to CPU:', err?.message);
      this.activeDevice = 'cpu';
      this.activeDispatcher = this.cpuDispatcher;
      this.cpuDispatcher.start(
        job,
        (p) => onProgress({ ...p, device: 'cpu' }),
        onComplete,
        onError
      );
    }
  }

  pause(): void {
    this.activeDispatcher?.pause?.();
  }

  resume(): void {
    this.activeDispatcher?.resume?.();
  }

  cancel(): void {
    this.activeDispatcher?.cancel?.();
    this.activeDispatcher = null;
  }

  destroy(): void {
    this.cancel();
    this.cpuDispatcher.destroy?.();
    this.gpuDispatcher.destroy?.();
  }
}

/**
 * Adapter bridging legacy RenderDispatcher to IDeviceDispatcher
 */
export class CpuWorkerAdapter implements IDeviceDispatcher {
  readonly deviceType: DeviceType = 'cpu';
  private dispatcher: RenderDispatcher;

  constructor(dispatcher?: RenderDispatcher) {
    this.dispatcher = dispatcher ?? new RenderDispatcher();
  }

  start(
    job: IOfflineRenderJob,
    onProgress: DeviceProgressCallback,
    onComplete: DeviceCompleteCallback,
    _onError?: DeviceErrorCallback
  ): void {
    this.dispatcher.start(
      job,
      (p) => {
        onProgress({
          jobId: p.jobId,
          pass: p.pass,
          totalPasses: p.totalPasses,
          photonsEmitted: p.totalPhotons,
          photonsPerSec: p.samplesPerSec,
          elapsedMs: p.elapsedMs,
          renderedBuffer: p.renderedBuffer,
          sampleCountMap: p.sampleCountMap,
          device: 'cpu'
        });
      },
      onComplete
    );
  }

  cancel(): void {
    this.dispatcher.cancel();
  }

  destroy(): void {
    this.dispatcher.destroy();
  }
}

/**
 * Adapter bridging WebGpuComputeDispatcher to IDeviceDispatcher
 */
export class GpuWorkerAdapter implements IDeviceDispatcher {
  readonly deviceType: DeviceType = 'gpu';
  private dispatcher: WebGpuComputeDispatcher;

  constructor(dispatcher?: WebGpuComputeDispatcher) {
    this.dispatcher = dispatcher ?? new WebGpuComputeDispatcher();
  }

  async start(
    job: IOfflineRenderJob,
    onProgress: DeviceProgressCallback,
    onComplete: DeviceCompleteCallback,
    onError?: DeviceErrorCallback
  ): Promise<void> {
    await this.dispatcher.start(
      job,
      (p) => {
        onProgress({
          jobId: p.jobId,
          pass: p.pass,
          totalPasses: p.totalPasses,
          photonsEmitted: p.photonsEmitted,
          photonsPerSec: p.photonsPerSec,
          elapsedMs: p.elapsedMs,
          renderedBuffer: p.renderedBuffer,
          sampleCountMap: p.sampleCountMap,
          device: 'gpu'
        });
      },
      onComplete,
      onError
    );
  }

  pause(): void {
    this.dispatcher.pause();
  }

  resume(): void {
    this.dispatcher.resume();
  }

  cancel(): void {
    this.dispatcher.cancel();
  }

  destroy(): void {
    this.dispatcher.destroy();
  }
}
