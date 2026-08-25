/**
 * 8-Frame Progressive EMA Temporal Accumulator
 *
 * Implements exponential moving average progressive temporal accumulation
 * using ping-pong HDR accumulation framebuffers over up to 8 static frames.
 */

import { WebGLContextManager, type FramebufferResource } from './webglContext';
import screenQuadVert from '../../shaders/screenQuad.vert';
import accumulateFrag from '../../shaders/temporalAccumulate.frag';

export const MAX_ACCUMULATION_FRAMES = 8;

export interface AccumulationResult {
  resultFbo: FramebufferResource;
  frameCount: number;
  isComplete: boolean;
}

export class TemporalAccumulator {
  private readonly context: WebGLContextManager;
  private readonly program: WebGLProgram;
  private fboA: FramebufferResource;
  private fboB: FramebufferResource;
  private currentPingPong = 0; // 0: A has accumulated, write to B; 1: B has accumulated, write to A
  private frameCount = 0;
  private width: number;
  private height: number;

  constructor(context: WebGLContextManager, width: number, height: number) {
    this.context = context;
    this.width = width;
    this.height = height;

    this.program = context.createProgram(screenQuadVert, accumulateFrag);
    this.fboA = context.createHDRFramebuffer(width, height);
    this.fboB = context.createHDRFramebuffer(width, height);
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  isComplete(): boolean {
    return this.frameCount >= MAX_ACCUMULATION_FRAMES;
  }

  reset(): void {
    this.frameCount = 0;
    this.currentPingPong = 0;
  }

  resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.context.resizeFramebuffer(this.fboA, width, height);
    this.context.resizeFramebuffer(this.fboB, width, height);
    this.reset();
  }

  accumulate(currentFrameFbo: FramebufferResource, width: number, height: number): AccumulationResult {
    if (this.frameCount >= MAX_ACCUMULATION_FRAMES) {
      const activeFbo = this.currentPingPong === 0 ? this.fboA : this.fboB;
      return {
        resultFbo: activeFbo,
        frameCount: this.frameCount,
        isComplete: true
      };
    }

    const gl = this.context.gl;
    this.frameCount++;

    const sourceAccFbo = this.currentPingPong === 0 ? this.fboA : this.fboB;
    const destAccFbo = this.currentPingPong === 0 ? this.fboB : this.fboA;

    // First frame: blend weight = 1.0 (overwrite accumulator with current frame)
    // Subsequent frames: weight = 1.0 / frameCount (exact progressive average)
    const blendWeight = 1.0 / this.frameCount;

    gl.bindFramebuffer(gl.FRAMEBUFFER, destAccFbo.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    gl.useProgram(this.program);

    const uCurrent = gl.getUniformLocation(this.program, 'u_CurrentFrame');
    const uAccum = gl.getUniformLocation(this.program, 'u_AccumulatedFrame');
    const uWeight = gl.getUniformLocation(this.program, 'u_BlendWeight');

    if (uCurrent) gl.uniform1i(uCurrent, 0);
    if (uAccum) gl.uniform1i(uAccum, 1);
    if (uWeight) gl.uniform1f(uWeight, blendWeight);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentFrameFbo.texture);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sourceAccFbo.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.currentPingPong = 1 - this.currentPingPong;

    return {
      resultFbo: destAccFbo,
      frameCount: this.frameCount,
      isComplete: this.frameCount >= MAX_ACCUMULATION_FRAMES
    };
  }

  dispose(): void {
    const gl = this.context.gl;
    this.context.deleteFramebuffer(this.fboA);
    this.context.deleteFramebuffer(this.fboB);
    gl.deleteProgram(this.program);
  }
}
