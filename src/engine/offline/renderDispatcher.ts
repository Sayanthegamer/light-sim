/**
 * RenderDispatcher: Multi-Threaded Web Worker Controller for Offline Monte Carlo Path Tracing
 *
 * Spawns and orchestrates a pool of background Web Workers scaling to hardware concurrency.
 * Aggregates progressive float accumulation buffers from all threads into a unified master target.
 */

import { type IOfflineRenderJob } from './sceneSnapshot';
import { type IWorkerOutboundMessage, type IWorkerProgressPayload } from './renderWorker';
import { AccumulationTarget } from './accumulationTarget';

export type ProgressCallback = (progress: IWorkerProgressPayload) => void;
export type CompleteCallback = (buffer: Float32Array, sampleCountMap: Uint32Array, elapsedMs: number) => void;
export type WorkerFactory = () => Worker;

export const defaultWorkerFactory: WorkerFactory = () => {
  return new Worker(new URL('./renderWorker.ts', import.meta.url), {
    type: 'module'
  });
};

interface IWorkerSlot {
  worker: Worker;
  isComplete: boolean;
  pass: number;
  totalPhotons: number;
  samplesPerSec: number;
  buffer: Float32Array | null;
  sampleCountMap: Uint32Array | null;
}

export class RenderDispatcher {
  private workers: IWorkerSlot[] = [];
  private masterTarget: AccumulationTarget | null = null;
  private onProgress: ProgressCallback | null = null;
  private onComplete: CompleteCallback | null = null;
  private workerFactory: WorkerFactory;
  private startTime = 0;
  private isCancelled = false;

  constructor(workerFactory: WorkerFactory = defaultWorkerFactory) {
    this.workerFactory = workerFactory;
  }

  /**
   * Returns the count of active workers currently spawned in the pool.
   */
  getWorkerCount(): number {
    return this.workers.length;
  }

  /**
   * Spawns worker pool, partitions target sample workload, and starts distributed rendering.
   */
  start(
    job: IOfflineRenderJob,
    onProgress: ProgressCallback,
    onComplete: CompleteCallback
  ): void {
    this.cancel();

    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.isCancelled = false;
    this.startTime = performance.now();

    const width = job.width;
    const height = job.height;
    this.masterTarget = new AccumulationTarget(width, height);

    // Determine thread count
    const systemConcurrency = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
    const threadCount = Math.max(1, Math.floor(job.config.threadCount || systemConcurrency));

    // Divide targetSamples evenly across workers
    const totalSamples = Math.max(1, job.config.targetSamples);
    const baseSamplesPerWorker = Math.floor(totalSamples / threadCount);
    const remainderSamples = totalSamples % threadCount;

    this.workers = [];

    for (let i = 0; i < threadCount; i++) {
      const workerSamples = baseSamplesPerWorker + (i < remainderSamples ? 1 : 0);
      if (workerSamples <= 0) continue;

      const worker = this.workerFactory();
      const slot: IWorkerSlot = {
        worker,
        isComplete: false,
        pass: 0,
        totalPhotons: 0,
        samplesPerSec: 0,
        buffer: null,
        sampleCountMap: null
      };

      this.workers.push(slot);

      // Create per-worker job slice with divided targetSamples
      const workerJob: IOfflineRenderJob = {
        ...job,
        jobId: `${job.jobId}_worker_${i}`,
        config: {
          ...job.config,
          targetSamples: workerSamples
        }
      };

      worker.onmessage = (e: MessageEvent<IWorkerOutboundMessage>) => {
        if (this.isCancelled) return;
        const data = e.data;
        if (data.type === 'PROGRESS') {
          slot.pass = data.pass;
          slot.totalPhotons = data.totalPhotons;
          slot.samplesPerSec = data.samplesPerSec;
          slot.buffer = data.buffer;
          slot.sampleCountMap = data.sampleCountMap;
          this.aggregateProgress();
        } else if (data.type === 'COMPLETE') {
          slot.isComplete = true;
          slot.totalPhotons = data.totalPhotons;
          slot.buffer = data.buffer;
          slot.sampleCountMap = data.sampleCountMap;
          this.checkAllCompleted();
        }
      };

      worker.postMessage({ type: 'START', job: workerJob });
    }
  }

  private aggregateProgress(): void {
    if (!this.masterTarget || this.isCancelled) return;

    this.masterTarget.reset();

    let combinedPass = 0;
    let combinedPhotons = 0;
    let combinedSpeed = 0;

    for (let i = 0; i < this.workers.length; i++) {
      const slot = this.workers[i];
      combinedPass += slot.pass;
      combinedPhotons += slot.totalPhotons;
      combinedSpeed += slot.samplesPerSec;

      if (slot.buffer) {
        this.masterTarget.mergeBuffer(slot.buffer, slot.sampleCountMap ?? undefined);
      }
    }

    const elapsedMs = performance.now() - this.startTime;

    this.onProgress?.({
      type: 'PROGRESS',
      pass: combinedPass,
      totalPhotons: combinedPhotons,
      samplesPerSec: combinedSpeed,
      elapsedMs,
      buffer: this.masterTarget.buffer,
      sampleCountMap: this.masterTarget.sampleCountMap
    });
  }

  private checkAllCompleted(): void {
    if (!this.masterTarget || this.isCancelled) return;

    const allDone = this.workers.every(w => w.isComplete);
    if (!allDone) return;

    this.masterTarget.reset();
    let totalPhotons = 0;

    for (let i = 0; i < this.workers.length; i++) {
      const slot = this.workers[i];
      totalPhotons += slot.totalPhotons;
      if (slot.buffer) {
        this.masterTarget.mergeBuffer(slot.buffer, slot.sampleCountMap ?? undefined);
      }
    }

    const elapsedMs = performance.now() - this.startTime;

    this.onComplete?.(this.masterTarget.buffer, this.masterTarget.sampleCountMap, elapsedMs);
  }

  /**
   * Broadcasts a PAUSE message to all workers in the pool.
   */
  pause(): void {
    for (let i = 0; i < this.workers.length; i++) {
      this.workers[i].worker.postMessage({ type: 'PAUSE' });
    }
  }

  /**
   * Broadcasts a RESUME message to all workers in the pool.
   */
  resume(): void {
    for (let i = 0; i < this.workers.length; i++) {
      this.workers[i].worker.postMessage({ type: 'RESUME' });
    }
  }

  /**
   * Cancels and terminates all running workers in the pool and frees resources.
   */
  cancel(): void {
    this.isCancelled = true;
    for (let i = 0; i < this.workers.length; i++) {
      try {
        this.workers[i].worker.postMessage({ type: 'CANCEL' });
        this.workers[i].worker.terminate();
      } catch {}
    }
    this.workers = [];
    this.masterTarget = null;
    this.onProgress = null;
    this.onComplete = null;
  }

  destroy(): void {
    this.cancel();
  }
}
