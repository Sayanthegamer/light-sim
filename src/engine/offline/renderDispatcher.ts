/**
 * RenderDispatcher: Main-Thread Controller for Offline Render Workers
 */

import { type IOfflineRenderJob } from './sceneSnapshot';
import { type IWorkerOutboundMessage, type IWorkerProgressPayload } from './renderWorker';

export type ProgressCallback = (progress: IWorkerProgressPayload) => void;
export type CompleteCallback = (buffer: Float32Array, sampleCountMap: Uint32Array, elapsedMs: number) => void;

export class RenderDispatcher {
  private worker: Worker | null = null;
  private onProgress: ProgressCallback | null = null;
  private onComplete: CompleteCallback | null = null;

  constructor() {}

  public start(
    job: IOfflineRenderJob,
    onProgress: ProgressCallback,
    onComplete: CompleteCallback
  ): void {
    this.cancel();

    this.onProgress = onProgress;
    this.onComplete = onComplete;

    // Vite worker constructor syntax
    this.worker = new Worker(new URL('./renderWorker.ts', import.meta.url), {
      type: 'module'
    });

    this.worker.onmessage = (e: MessageEvent<IWorkerOutboundMessage>) => {
      const data = e.data;
      if (data.type === 'PROGRESS') {
        this.onProgress?.(data);
      } else if (data.type === 'COMPLETE') {
        this.onComplete?.(data.buffer, data.sampleCountMap, data.elapsedMs);
      }
    };

    this.worker.postMessage({ type: 'START', job });
  }

  public pause(): void {
    this.worker?.postMessage({ type: 'PAUSE' });
  }

  public resume(): void {
    this.worker?.postMessage({ type: 'RESUME' });
  }

  public cancel(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'CANCEL' });
      this.worker.terminate();
      this.worker = null;
    }
  }
}
