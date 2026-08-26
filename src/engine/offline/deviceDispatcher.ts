/**
 * Device Dispatcher Core Interfaces & Telemetry Contracts
 *
 * Defines unified multi-device dispatching interfaces for CPU worker pools,
 * native WebGPU Compute-to-Raster engines, and hybrid render pipelines.
 */

import { type IOfflineRenderJob } from './sceneSnapshot';

export type DeviceType = 'cpu' | 'gpu' | 'auto';

export interface IDeviceProgress {
  jobId: string;
  pass: number;
  totalPasses: number;
  photonsEmitted: number;
  photonsPerSec: number;
  elapsedMs: number;
  renderedBuffer: Float32Array;
  sampleCountMap: Uint32Array;
  device?: DeviceType;
}

export type DeviceProgressCallback = (progress: IDeviceProgress) => void;
export type DeviceCompleteCallback = (
  buffer: Float32Array,
  sampleCountMap: Uint32Array,
  elapsedMs: number
) => void;
export type DeviceErrorCallback = (error: Error) => void;

export interface IDeviceDispatcher {
  readonly deviceType: DeviceType;
  start(
    job: IOfflineRenderJob,
    onProgress: DeviceProgressCallback,
    onComplete: DeviceCompleteCallback,
    onError?: DeviceErrorCallback
  ): void | Promise<void>;
  pause?(): void;
  resume?(): void;
  cancel(): void;
  destroy?(): void;
}
