/**
 * Dirty-State Event-Driven Render Coordinator
 *
 * Coordinates the full multi-pass pipeline:
 * Pass 1: Forward Beam Quad Rasterizer (BeamPass)
 * Pass 2: Obstacle Geometry Mask Rasterizer (MaskPass)
 * Pass 3: Two-Tier Hybrid Scatter Filter (ScatterPass)
 * Pass 4: Extended Reinhard Tonemapping & Composite (CompositePass)
 * Pass 5: 8-Frame Progressive EMA Accumulation (TemporalAccumulator)
 *
 * Automatically sleeps when resting to eliminate idle CPU/GPU load.
 */

import { WebGLContextManager, type FramebufferResource } from './webglContext';
import { BeamPass } from './beamPass';
import { MaskPass } from './maskPass';
import { ScatterPass } from './scatterPass';
import { CompositePass } from './compositePass';
import { TemporalAccumulator } from './temporalAccumulator';

export enum RenderState {
  Interacting = 'INTERACTING',
  Settling = 'SETTLING',
  Sleeping = 'SLEEPING'
}

export class RenderCoordinator {
  private readonly context: WebGLContextManager;
  readonly beamPass: BeamPass;
  readonly maskPass: MaskPass;
  readonly scatterPass: ScatterPass;
  readonly compositePass: CompositePass;
  readonly accumulator: TemporalAccumulator;

  private state: RenderState = RenderState.Interacting;
  private isInteractingFlag = true;
  private width: number;
  private height: number;

  constructor(context: WebGLContextManager, width: number, height: number) {
    this.context = context;
    this.width = width;
    this.height = height;

    this.beamPass = new BeamPass(context);
    this.maskPass = new MaskPass(context);
    this.scatterPass = new ScatterPass(context, width, height);
    this.compositePass = new CompositePass(context);
    this.accumulator = new TemporalAccumulator(context, width, height);
  }

  getContext(): WebGLContextManager {
    return this.context;
  }

  getState(): RenderState {
    return this.state;
  }

  isSleeping(): boolean {
    return this.state === RenderState.Sleeping;
  }

  isInteracting(): boolean {
    return this.isInteractingFlag;
  }

  setInteracting(interacting: boolean): void {
    this.isInteractingFlag = interacting;
    if (interacting) {
      this.state = RenderState.Interacting;
      this.accumulator.reset();
    } else {
      if (this.state === RenderState.Interacting) {
        this.state = RenderState.Settling;
      }
    }
  }

  markDirty(isInteraction = false): void {
    this.accumulator.reset();
    if (isInteraction) {
      this.isInteractingFlag = true;
      this.state = RenderState.Interacting;
    } else {
      this.state = RenderState.Settling;
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.scatterPass.resize(width, height);
    this.accumulator.resize(width, height);
    this.markDirty(true);
  }

  tick(sourceFrame: FramebufferResource): FramebufferResource {
    if (this.state === RenderState.Interacting) {
      return sourceFrame;
    }

    if (this.state === RenderState.Settling) {
      const result = this.accumulator.accumulate(sourceFrame, this.width, this.height);
      if (result.isComplete) {
        this.state = RenderState.Sleeping;
      }
      return result.resultFbo;
    }

    if (this.state === RenderState.Sleeping) {
      return this.accumulator.accumulate(sourceFrame, this.width, this.height).resultFbo;
    }

    return sourceFrame;
  }

  dispose(): void {
    this.beamPass.dispose();
    this.maskPass.dispose();
    this.scatterPass.dispose();
    this.compositePass.dispose();
    this.accumulator.dispose();
  }
}
