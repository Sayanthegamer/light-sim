import { describe, it, expect, vi } from 'vitest';
import { RenderDispatcher, type WorkerFactory } from '../../src/engine/offline/renderDispatcher';
import { freezeSceneSnapshot } from '../../src/engine/offline/sceneSnapshot';
import { SceneGraph } from '../../src/engine/scene/sceneGraph';
import { EmitterNode } from '../../src/engine/scene/emitterNode';

class MockWorker {
  public onmessage: ((e: MessageEvent) => void) | null = null;
  public postMessage = vi.fn((msg: any) => {
    this.sentMessages.push(msg);
  });
  public terminate = vi.fn();
  public sentMessages: any[] = [];

  public emit(data: any) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe('RenderDispatcher Multi-Threaded Worker Pool', () => {
  function createTestJob(threadCount = 4, targetSamples = 100) {
    const scene = new SceneGraph();
    scene.addNode(new EmitterNode('em_1', { x: 50, y: 50 }, 0));
    return freezeSceneSnapshot(scene, 100, 100, {
      threadCount,
      targetSamples,
      batchPhotons: 1000
    });
  }

  it('spawns requested number of worker threads and distributes targetSamples evenly', () => {
    const mockWorkers: MockWorker[] = [];
    const mockFactory: WorkerFactory = () => {
      const w = new MockWorker();
      mockWorkers.push(w);
      return w as unknown as Worker;
    };

    const dispatcher = new RenderDispatcher(mockFactory);
    const job = createTestJob(4, 100);

    const onProgress = vi.fn();
    const onComplete = vi.fn();

    dispatcher.start(job, onProgress, onComplete);

    // Should spawn 4 workers
    expect(mockWorkers.length).toBe(4);
    expect(dispatcher.getWorkerCount()).toBe(4);

    // Each worker should receive START message with targetSamples divided (100 / 4 = 25)
    for (let i = 0; i < 4; i++) {
      expect(mockWorkers[i].postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'START',
          job: expect.objectContaining({
            config: expect.objectContaining({
              targetSamples: 25
            })
          })
        })
      );
    }
  });

  it('aggregates progressive buffers from multiple workers and computes combined metrics', () => {
    const mockWorkers: MockWorker[] = [];
    const mockFactory: WorkerFactory = () => {
      const w = new MockWorker();
      mockWorkers.push(w);
      return w as unknown as Worker;
    };

    const dispatcher = new RenderDispatcher(mockFactory);
    const job = createTestJob(2, 50);

    const onProgress = vi.fn();
    const onComplete = vi.fn();

    dispatcher.start(job, onProgress, onComplete);

    const buf1 = new Float32Array(100 * 100 * 4);
    buf1[0] = 1.0; buf1[1] = 0.5; buf1[2] = 0.2; buf1[3] = 1.0;
    const samples1 = new Uint32Array(100 * 100);
    samples1[0] = 5;

    const buf2 = new Float32Array(100 * 100 * 4);
    buf2[0] = 2.0; buf2[1] = 1.0; buf2[2] = 0.4; buf2[3] = 2.0;
    const samples2 = new Uint32Array(100 * 100);
    samples2[0] = 10;

    // Worker 0 emits progress
    mockWorkers[0].emit({
      type: 'PROGRESS',
      pass: 5,
      totalPhotons: 5000,
      samplesPerSec: 1000,
      elapsedMs: 50,
      buffer: buf1,
      sampleCountMap: samples1
    });

    // Worker 1 emits progress
    mockWorkers[1].emit({
      type: 'PROGRESS',
      pass: 8,
      totalPhotons: 8000,
      samplesPerSec: 1600,
      elapsedMs: 50,
      buffer: buf2,
      sampleCountMap: samples2
    });

    expect(onProgress).toHaveBeenCalled();
    const lastProgress = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];

    // Total passes = 5 + 8 = 13
    expect(lastProgress.pass).toBe(13);
    // Total photons = 5000 + 8000 = 13000
    expect(lastProgress.totalPhotons).toBe(13000);
    // Combined buffer at index 0 should be 1.0 + 2.0 = 3.0
    expect(lastProgress.buffer[0]).toBeCloseTo(3.0);
    // Combined sample count at index 0 should be 5 + 10 = 15
    expect(lastProgress.sampleCountMap[0]).toBe(15);
  });

  it('synchronizes PAUSE, RESUME, and CANCEL commands across all workers in the pool', () => {
    const mockWorkers: MockWorker[] = [];
    const mockFactory: WorkerFactory = () => {
      const w = new MockWorker();
      mockWorkers.push(w);
      return w as unknown as Worker;
    };

    const dispatcher = new RenderDispatcher(mockFactory);
    const job = createTestJob(3, 60);

    dispatcher.start(job, vi.fn(), vi.fn());

    dispatcher.pause();
    for (let i = 0; i < 3; i++) {
      expect(mockWorkers[i].postMessage).toHaveBeenCalledWith({ type: 'PAUSE' });
    }

    dispatcher.resume();
    for (let i = 0; i < 3; i++) {
      expect(mockWorkers[i].postMessage).toHaveBeenCalledWith({ type: 'RESUME' });
    }

    dispatcher.cancel();
    for (let i = 0; i < 3; i++) {
      expect(mockWorkers[i].postMessage).toHaveBeenCalledWith({ type: 'CANCEL' });
      expect(mockWorkers[i].terminate).toHaveBeenCalled();
    }
  });

  it('triggers onComplete when all workers in the pool complete', () => {
    const mockWorkers: MockWorker[] = [];
    const mockFactory: WorkerFactory = () => {
      const w = new MockWorker();
      mockWorkers.push(w);
      return w as unknown as Worker;
    };

    const dispatcher = new RenderDispatcher(mockFactory);
    const job = createTestJob(2, 50);

    const onProgress = vi.fn();
    const onComplete = vi.fn();

    dispatcher.start(job, onProgress, onComplete);

    const buf1 = new Float32Array(100 * 100 * 4);
    buf1[0] = 5.0;
    const samples1 = new Uint32Array(100 * 100);
    samples1[0] = 20;

    const buf2 = new Float32Array(100 * 100 * 4);
    buf2[0] = 7.0;
    const samples2 = new Uint32Array(100 * 100);
    samples2[0] = 30;

    // Worker 0 completes
    mockWorkers[0].emit({
      type: 'COMPLETE',
      totalPhotons: 25000,
      elapsedMs: 200,
      buffer: buf1,
      sampleCountMap: samples1
    });

    // onComplete should not fire yet because worker 1 is still running
    expect(onComplete).not.toHaveBeenCalled();

    // Worker 1 completes
    mockWorkers[1].emit({
      type: 'COMPLETE',
      totalPhotons: 25000,
      elapsedMs: 210,
      buffer: buf2,
      sampleCountMap: samples2
    });

    // Now onComplete should fire with merged results
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [finalBuffer, finalSamples] = onComplete.mock.calls[0];
    expect(finalBuffer[0]).toBeCloseTo(12.0);
    expect(finalSamples[0]).toBe(50);
  });
});
