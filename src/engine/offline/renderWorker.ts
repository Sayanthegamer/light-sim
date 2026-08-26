/**
 * Offline Production Monte Carlo Web Worker Kernel
 *
 * Runs progressive continuous-spectral Monte Carlo photon tracing in a background Web Worker.
 */

import { type IOfflineRenderJob } from './sceneSnapshot';
import {
  tracePhotonPath,
  extractScenePrimitives,
  createTracerScratchContext,
  type IPhotonState,
  type IResolvedScenePrimitives,
  type ITracerScratchContext
} from './mcPhotonTracer';
import { sampleContinuousWavelength } from './spectralSampler';
import { AccumulationTarget } from './accumulationTarget';

export interface IWorkerMessageStart {
  type: 'START';
  job: IOfflineRenderJob;
}

export interface IWorkerMessagePause {
  type: 'PAUSE';
}

export interface IWorkerMessageResume {
  type: 'RESUME';
}

export interface IWorkerMessageCancel {
  type: 'CANCEL';
}

export type IWorkerInboundMessage =
  | IWorkerMessageStart
  | IWorkerMessagePause
  | IWorkerMessageResume
  | IWorkerMessageCancel;

export interface IWorkerProgressPayload {
  type: 'PROGRESS';
  pass: number;
  totalPhotons: number;
  samplesPerSec: number;
  elapsedMs: number;
  buffer: Float32Array;
  sampleCountMap: Uint32Array;
}

export interface IWorkerCompletePayload {
  type: 'COMPLETE';
  totalPhotons: number;
  elapsedMs: number;
  buffer: Float32Array;
  sampleCountMap: Uint32Array;
}

export type IWorkerOutboundMessage = IWorkerProgressPayload | IWorkerCompletePayload;

// Worker Execution State
let currentJob: IOfflineRenderJob | null = null;
let currentPrimitives: IResolvedScenePrimitives | null = null;
const tracerScratch: ITracerScratchContext = createTracerScratchContext();
let target: AccumulationTarget | null = null;
let isPaused = false;
let isCancelled = false;
let isRunning = false;

let passCount = 0;
let totalPhotonsDispatched = 0;
let startTime = 0;
let lastProgressReportTime = 0;

/**
 * Dispatches a batch of Monte Carlo photons from scene emitters.
 */
function processBatch(): void {
  if (!currentJob || !target || isCancelled || isPaused) {
    isRunning = false;
    return;
  }

  isRunning = true;
  const job = currentJob;
  const emitters = job.scene.emitters;
  const batchSize = job.config.batchPhotons;
  const numEmitters = emitters.length;

  if (numEmitters === 0) {
    postProgress(true);
    isRunning = false;
    return;
  }

  const photon: IPhotonState = {
    pos: { x: 0, y: 0 },
    dir: { x: 0, y: 0 },
    wavelengthNm: 550,
    energy: 1.0,
    phase: 0.0
  };

  for (let i = 0; i < batchSize; i++) {
    // Select emitter
    const emitterIdx = (Math.random() * numEmitters) | 0;
    const emitter = emitters[emitterIdx];

    // Sample spatial offset across emitter slit
    const u = Math.random() - 0.5; // [-0.5, 0.5]
    const halfW = emitter.width * u;
    const nx = -emitter.dir.y;
    const ny = emitter.dir.x;

    photon.pos.x = emitter.pos.x + nx * halfW;
    photon.pos.y = emitter.pos.y + ny * halfW;
    photon.dir.x = emitter.dir.x;
    photon.dir.y = emitter.dir.y;

    // Sample continuous spectral wavelength \lambda \sim [380, 780]
    photon.wavelengthNm = sampleContinuousWavelength(
      emitter.spectrumType,
      emitter.spectrumParam,
      Math.random()
    );
    photon.energy = emitter.power;
    photon.phase = Math.random() * 2.0 * Math.PI;

    tracePhotonPath(photon, job.scene, target, {
      maxBounces: job.config.maxBounces,
      volumetricInScatter: job.config.volumetricInScatter,
      primitives: currentPrimitives ?? undefined,
      scratch: tracerScratch
    });
  }

  totalPhotonsDispatched += batchSize;
  passCount++;

  const now = performance.now();
  const elapsedSinceLastReport = now - lastProgressReportTime;

  // Report progress every ~100ms or on target completion
  const isComplete = passCount >= job.config.targetSamples;
  if (elapsedSinceLastReport >= 100 || isComplete) {
    postProgress(isComplete);
    lastProgressReportTime = now;
  }

  if (isComplete) {
    isRunning = false;
  } else if (!isPaused && !isCancelled) {
    // Schedule next batch on worker event loop
    setTimeout(processBatch, 0);
  }
}

function postProgress(isComplete: boolean): void {
  if (!target) return;
  const now = performance.now();
  const elapsedMs = now - startTime;
  const samplesPerSec = elapsedMs > 0 ? (totalPhotonsDispatched / elapsedMs) * 1000 : 0;

  // Send cloned copy of float buffer for UI rendering
  const bufferCopy = new Float32Array(target.buffer);
  const sampleMapCopy = new Uint32Array(target.sampleCountMap);

  const workerCtx = self as unknown as { postMessage: (msg: unknown, transfer?: Transferable[]) => void };

  if (isComplete) {
    const msg: IWorkerCompletePayload = {
      type: 'COMPLETE',
      totalPhotons: totalPhotonsDispatched,
      elapsedMs,
      buffer: bufferCopy,
      sampleCountMap: sampleMapCopy
    };
    workerCtx.postMessage(msg, [bufferCopy.buffer, sampleMapCopy.buffer]);
  } else {
    const msg: IWorkerProgressPayload = {
      type: 'PROGRESS',
      pass: passCount,
      totalPhotons: totalPhotonsDispatched,
      samplesPerSec,
      elapsedMs,
      buffer: bufferCopy,
      sampleCountMap: sampleMapCopy
    };
    workerCtx.postMessage(msg, [bufferCopy.buffer, sampleMapCopy.buffer]);
  }
}

// Attach worker message listener if running in Web Worker context
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = (e: MessageEvent<IWorkerInboundMessage>) => {
    const msg = e.data;
    switch (msg.type) {
      case 'START':
        currentJob = msg.job;
        currentPrimitives = extractScenePrimitives(msg.job.scene);
        target = new AccumulationTarget(msg.job.width, msg.job.height);
        isPaused = false;
        isCancelled = false;
        passCount = 0;
        totalPhotonsDispatched = 0;
        startTime = performance.now();
        lastProgressReportTime = startTime;
        processBatch();
        break;

      case 'PAUSE':
        isPaused = true;
        break;

      case 'RESUME':
        if (isPaused) {
          isPaused = false;
          if (!isRunning) {
            processBatch();
          }
        }
        break;

      case 'CANCEL':
        isCancelled = true;
        isPaused = false;
        isRunning = false;
        currentJob = null;
        target = null;
        break;
    }
  };
}
