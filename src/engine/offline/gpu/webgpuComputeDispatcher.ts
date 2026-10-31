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
  private epochPassCount = 0;
  private epochCount = 0;
  private readonly epochSize = 5; // Consolidate rgba16float into Float64Array every 10 passes to eliminate mantissa underflow
  private masterAccumulator: Float64Array | null = null;
  private masterBuffer: Float32Array | null = null;
  private sampleCountMap: Uint32Array | null = null;
  private varianceDelta = 0;
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

  getVarianceDelta(): number {
    return this.varianceDelta;
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
    this.epochPassCount = 0;
    this.epochCount = 0;
    this.totalPhotonsEmitted = 0;
    this.startTime = performance.now();
    this.lastReportTime = this.startTime;
    this.isRunning = true;
    this.isPaused = false;

    const numPixels = job.width * job.height;
    const numElements = numPixels * 4;
    this.masterAccumulator = new Float64Array(numElements);
    this.masterBuffer = new Float32Array(numElements);
    this.sampleCountMap = new Uint32Array(numPixels);
    this.varianceDelta = 0;

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

      const batchSize = job.config.batchPhotons ?? 50000;
      const maxBounces = Math.min(32, job.config.maxBounces ?? 32);
      const volumetric = job.config.volumetricInScatter ?? true;
      this.pipelineMgr.updateScene(job.scene, batchSize, maxBounces, volumetric);

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

    try {
      // Execute compute + raster pass on GPU
      this.accumulator.renderPass(this.pipelineMgr);
      this.passCount++;
      this.epochPassCount++;
      const currentBatch = this.pipelineMgr.getBatchSize();
      this.totalPhotonsEmitted += currentBatch;

      const targetSamples = this.currentJob.config.targetSamples ?? 100;
      const isComplete = this.passCount >= targetSamples;
      const isEpochBoundary = this.epochPassCount >= this.epochSize;

      const now = performance.now();
      const timeSinceReport = now - this.lastReportTime;
      const shouldReport = isComplete || timeSinceReport >= 100;

      // Consolidate 10-pass epoch into 64-bit float masterAccumulator
      if (isEpochBoundary || isComplete) {
        const epochBuffer = await this.accumulator.readbackToFloat32Array();
        this.epochCount++;

        const totalElements = this.masterAccumulator!.length;
        const consolidatedPasses = this.passCount - this.epochPassCount;
        const invTotalPasses = 1.0 / Math.max(1, this.passCount);

        for (let i = 0; i < totalElements; i++) {
          const prevSum = this.masterAccumulator![i] * consolidatedPasses;
          const newSum = prevSum + epochBuffer[i];
          this.masterAccumulator![i] = newSum * invTotalPasses;
          this.masterBuffer![i] = newSum;
        }

        // Strided variance sampling for 4K real-time telemetry
        const stride = Math.max(1, Math.floor(totalElements / 16384));
        const epochWeight = 1.0 / Math.max(1, this.epochPassCount);
        let sqDiffSum = 0;
        let sampleCount = 0;
        for (let i = 0; i < totalElements; i += stride) {
          const sampleVal = epochBuffer[i] * epochWeight;
          const diff = sampleVal - this.masterAccumulator![i];
          sqDiffSum += diff * diff;
          sampleCount++;
        }

        this.varianceDelta = sqDiffSum / Math.max(1, sampleCount);

        if (!isComplete) {
          this.accumulator.reset();
          this.epochPassCount = 0;
        }
      }

      if (shouldReport) {
        this.lastReportTime = performance.now();
        const totalElapsedMs = this.lastReportTime - this.startTime;
        const photonsPerSec = (this.totalPhotonsEmitted / Math.max(1, totalElapsedMs)) * 1000;

        if (this.epochPassCount > 0 && !isComplete) {
          const liveEpochBuf = await this.accumulator.readbackToFloat32Array();
          const consolidatedPasses = this.passCount - this.epochPassCount;
          const totalElements = this.masterBuffer!.length;
          if (consolidatedPasses === 0) {
            this.masterBuffer!.set(liveEpochBuf);
          } else {
            for (let i = 0; i < totalElements; i++) {
              this.masterBuffer![i] = this.masterAccumulator![i] * consolidatedPasses + liveEpochBuf[i];
            }
          }
        }

        this.sampleCountMap!.fill(this.passCount);

        if (this.onProgress && this.masterBuffer && this.sampleCountMap) {
          this.onProgress({
            jobId: this.currentJob.jobId,
            pass: this.passCount,
            totalPasses: targetSamples,
            photonsEmitted: this.totalPhotonsEmitted,
            photonsPerSec,
            elapsedMs: totalElapsedMs,
            renderedBuffer: this.masterBuffer,
            sampleCountMap: this.sampleCountMap
          });
        }

        if (isComplete) {
          this.state = 'COMPLETE';
          this.isRunning = false;
          if (this.onComplete && this.masterBuffer && this.sampleCountMap) {
            this.onComplete(this.masterBuffer, this.sampleCountMap, totalElapsedMs);
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
