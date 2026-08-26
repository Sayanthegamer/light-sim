/**
 * WebGPU Compute Dispatcher & Lifecycle Manager
 *
 * Coordinates asynchronous Monte Carlo photon simulation and rasterization passes on the GPU,
 * reporting live telemetry, managing micro-batch pacing, and providing clean pause/resume/cancel lifecycles.
 */

import { WebGpuContext, initWebGpuContext } from './webgpuContext';
import { GpuPipelineManager } from './webgpuPipeline';
import { GpuAccumulator } from './gpuAccumulator';
import { type IOfflineRenderJob } from '../sceneSnapshot';
import { type IDeviceProgress } from '../deviceDispatcher';

export type DispatcherState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETE' | 'CANCELLED' | 'ERROR';

export type ProgressCallback = (progress: IDeviceProgress) => void;
export type CompleteCallback = (
  buffer: Float32Array,
  sampleCountMap: Uint32Array,
  elapsedMs: number
) => void;
export type ErrorCallback = (error: Error) => void;

export class WebGpuComputeDispatcher {
  private state: DispatcherState = 'IDLE';
  private contextProvider: () => Promise<WebGpuContext | null>;
  private context: WebGpuContext | null = null;
  private pipelineMgr: GpuPipelineManager | null = null;
  private accumulator: GpuAccumulator | null = null;

  private currentJob: IOfflineRenderJob | null = null;
  private onProgress: ProgressCallback | null = null;
  private onComplete: CompleteCallback | null = null;
  private onError: ErrorCallback | null = null;

  private isRunning = false;
  private isPaused = false;
  private passCount = 0;
  private totalPhotonsEmitted = 0;
  private startTime = 0;
  private lastReportTime = 0;
  private timerId: any = null;

  constructor(contextProvider?: () => Promise<WebGpuContext | null>) {
    this.contextProvider = contextProvider ?? initWebGpuContext;
  }

  getState(): DispatcherState {
    return this.state;
  }

  getPassCount(): number {
    return this.passCount;
  }

  async start(
    job: IOfflineRenderJob,
    onProgress: ProgressCallback,
    onComplete: CompleteCallback,
    onError?: ErrorCallback
  ): Promise<void> {
    this.currentJob = job;
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.onError = onError ?? null;
    this.passCount = 0;
    this.totalPhotonsEmitted = 0;
    this.startTime = performance.now();
    this.lastReportTime = this.startTime;
    this.isRunning = true;
    this.isPaused = false;

    try {
      this.context = await this.contextProvider();
      if (!this.context) {
        throw new Error('WebGPU is not supported or device initialization failed.');
      }

      this.context.onDeviceLost((info) => {
        console.warn('WebGPU device lost in compute dispatcher:', info.message);
        this.handleFailure(new Error(`WebGPU Device Lost: ${info.message}`));
      });

      const device = this.context.device;
      this.pipelineMgr = new GpuPipelineManager(device);
      this.accumulator = new GpuAccumulator(device, job.width, job.height);

      const batchSize = job.config.batchPhotons ?? 100000;
      this.pipelineMgr.updateScene(job.scene, batchSize);

      this.state = 'RUNNING';
      this.scheduleNextStep();
    } catch (err: any) {
      this.handleFailure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  pause(): void {
    if (this.state === 'RUNNING') {
      this.state = 'PAUSED';
      this.isPaused = true;
      if (this.timerId) {
        clearTimeout(this.timerId);
        this.timerId = null;
      }
    }
  }

  resume(): void {
    if (this.state === 'PAUSED') {
      this.state = 'RUNNING';
      this.isPaused = false;
      this.scheduleNextStep();
    }
  }

  cancel(): void {
    this.isRunning = false;
    this.state = 'CANCELLED';
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.cleanup();
  }

  private scheduleNextStep(): void {
    if (!this.isRunning || this.isPaused || this.state !== 'RUNNING') {
      return;
    }

    this.timerId = setTimeout(() => {
      this.executeMicroBatch();
    }, 0);
  }

  private async executeMicroBatch(): Promise<void> {
    if (!this.isRunning || this.isPaused || !this.pipelineMgr || !this.accumulator || !this.currentJob) {
      return;
    }

    const frameStart = performance.now();

    try {
      // Execute compute + raster pass on GPU
      this.accumulator.renderPass(this.pipelineMgr);
      this.passCount++;
      const currentBatch = this.pipelineMgr.getBatchSize();
      this.totalPhotonsEmitted += currentBatch;

      const frameEnd = performance.now();
      const frameElapsed = frameEnd - frameStart;
      this.pipelineMgr.adjustBatchPacing(frameElapsed);

      const targetSamples = this.currentJob.config.targetSamples ?? 100;
      const isComplete = this.passCount >= targetSamples;

      // Periodically report progress or when complete
      const now = performance.now();
      const timeSinceReport = now - this.lastReportTime;

      if (isComplete || timeSinceReport >= 100) {
        this.lastReportTime = now;
        const totalElapsedMs = now - this.startTime;
        const photonsPerSec = (this.totalPhotonsEmitted / Math.max(1, totalElapsedMs)) * 1000;

        const buffer = await this.accumulator.readbackToFloat32Array();
        const sampleCountMap = new Uint32Array(this.currentJob.width * this.currentJob.height);
        sampleCountMap.fill(this.passCount);

        if (this.onProgress) {
          this.onProgress({
            jobId: this.currentJob.jobId,
            pass: this.passCount,
            totalPasses: targetSamples,
            photonsEmitted: this.totalPhotonsEmitted,
            photonsPerSec,
            elapsedMs: totalElapsedMs,
            renderedBuffer: buffer,
            sampleCountMap
          });
        }

        if (isComplete) {
          this.state = 'COMPLETE';
          this.isRunning = false;
          if (this.onComplete) {
            this.onComplete(buffer, sampleCountMap, totalElapsedMs);
          }
          this.cleanup();
          return;
        }
      }

      this.scheduleNextStep();
    } catch (err: any) {
      this.handleFailure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private handleFailure(error: Error): void {
    this.state = 'ERROR';
    this.isRunning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.cleanup();
    if (this.onError) {
      this.onError(error);
    }
  }

  private cleanup(): void {
    try {
      this.accumulator?.destroy();
      this.pipelineMgr?.destroy();
    } catch {}
    this.accumulator = null;
    this.pipelineMgr = null;
  }

  destroy(): void {
    this.cancel();
  }
}
