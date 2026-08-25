/**
 * Pass 3: Two-Tier Hybrid Scatter Filter Engine
 *
 * Implements:
 * Tier 1: 1/2-resolution 5-tap Depth-Masked Cross-Bilateral Gaussian Blur
 * Tier 2: 2-stage Dual Kawase Downsample / Upsample Bloom Filter
 * Combine: Additive fusion into a single atmospheric scatter buffer
 */

import { WebGLContextManager, type FramebufferResource } from './webglContext';
import screenQuadVert from '../../shaders/screenQuad.vert';
import bilateralFrag from '../../shaders/bilateralScatter.frag';
import kawaseDownFrag from '../../shaders/dualKawaseDown.frag';
import kawaseUpFrag from '../../shaders/dualKawaseUp.frag';
import combineFrag from '../../shaders/scatterCombine.frag';

export class ScatterPass {
  private readonly context: WebGLContextManager;

  // Shader Programs
  private readonly bilateralProg: WebGLProgram;
  private readonly kawaseDownProg: WebGLProgram;
  private readonly kawaseUpProg: WebGLProgram;
  private readonly combineProg: WebGLProgram;

  // Hierarchical Multi-Resolution FBOs
  private fboHalfA: FramebufferResource;
  private fboHalfB: FramebufferResource;
  private fboHalfCombine: FramebufferResource;
  private fboQuarter: FramebufferResource;
  private fboEighth: FramebufferResource;

  private halfW: number;
  private halfH: number;
  private quarterW: number;
  private quarterH: number;
  private eighthW: number;
  private eighthH: number;

  constructor(context: WebGLContextManager, width: number, height: number) {
    this.context = context;

    this.bilateralProg = context.createProgram(screenQuadVert, bilateralFrag);
    this.kawaseDownProg = context.createProgram(screenQuadVert, kawaseDownFrag);
    this.kawaseUpProg = context.createProgram(screenQuadVert, kawaseUpFrag);
    this.combineProg = context.createProgram(screenQuadVert, combineFrag);

    this.halfW = Math.max(1, Math.floor(width / 2));
    this.halfH = Math.max(1, Math.floor(height / 2));
    this.quarterW = Math.max(1, Math.floor(width / 4));
    this.quarterH = Math.max(1, Math.floor(height / 4));
    this.eighthW = Math.max(1, Math.floor(width / 8));
    this.eighthH = Math.max(1, Math.floor(height / 8));

    this.fboHalfA = context.createHDRFramebuffer(this.halfW, this.halfH);
    this.fboHalfB = context.createHDRFramebuffer(this.halfW, this.halfH);
    this.fboHalfCombine = context.createHDRFramebuffer(this.halfW, this.halfH);
    this.fboQuarter = context.createHDRFramebuffer(this.quarterW, this.quarterH);
    this.fboEighth = context.createHDRFramebuffer(this.eighthW, this.eighthH);
  }

  getHalfWidth(): number { return this.halfW; }
  getHalfHeight(): number { return this.halfH; }
  getQuarterWidth(): number { return this.quarterW; }
  getQuarterHeight(): number { return this.quarterH; }
  getEighthWidth(): number { return this.eighthW; }
  getEighthHeight(): number { return this.eighthH; }

  resize(width: number, height: number): void {
    this.halfW = Math.max(1, Math.floor(width / 2));
    this.halfH = Math.max(1, Math.floor(height / 2));
    this.quarterW = Math.max(1, Math.floor(width / 4));
    this.quarterH = Math.max(1, Math.floor(height / 4));
    this.eighthW = Math.max(1, Math.floor(width / 8));
    this.eighthH = Math.max(1, Math.floor(height / 8));

    this.context.resizeFramebuffer(this.fboHalfA, this.halfW, this.halfH);
    this.context.resizeFramebuffer(this.fboHalfB, this.halfW, this.halfH);
    this.context.resizeFramebuffer(this.fboHalfCombine, this.halfW, this.halfH);
    this.context.resizeFramebuffer(this.fboQuarter, this.quarterW, this.quarterH);
    this.context.resizeFramebuffer(this.fboEighth, this.eighthW, this.eighthH);
  }

  execute(
    lightFbo: FramebufferResource,
    maskFbo: FramebufferResource,
    width: number,
    height: number,
    hazeDensity = 0.35,
    bloomIntensity = 0.25
  ): FramebufferResource {
    const gl = this.context.gl;

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // ==========================================
    // Tier 1: 5-Tap Bilateral Blur (H then V)
    // ==========================================
    gl.useProgram(this.bilateralProg);
    const uLightTex = gl.getUniformLocation(this.bilateralProg, 'u_LightTexture');
    const uMaskTex = gl.getUniformLocation(this.bilateralProg, 'u_MaskTexture');
    const uDir = gl.getUniformLocation(this.bilateralProg, 'u_Direction');
    const uRadius = gl.getUniformLocation(this.bilateralProg, 'u_Radius');
    const uHaze = gl.getUniformLocation(this.bilateralProg, 'u_HazeDensity');

    if (uLightTex) gl.uniform1i(uLightTex, 0);
    if (uMaskTex) gl.uniform1i(uMaskTex, 1);
    if (uRadius) gl.uniform1f(uRadius, 2.0);
    if (uHaze) gl.uniform1f(uHaze, hazeDensity);

    // 1. Horizontal Bilateral: lightFbo -> fboHalfB
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboHalfB.framebuffer);
    gl.viewport(0, 0, this.halfW, this.halfH);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, lightFbo.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskFbo.texture);

    if (uDir) gl.uniform2f(uDir, 1.0 / width, 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. Vertical Bilateral: fboHalfB -> fboHalfA
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboHalfA.framebuffer);
    gl.viewport(0, 0, this.halfW, this.halfH);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboHalfB.texture);

    if (uDir) gl.uniform2f(uDir, 0.0, 1.0 / height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ==========================================
    // Tier 2: 2-Stage Dual Kawase Bloom
    // ==========================================
    // Downsample 1: fboHalfA -> fboQuarter
    gl.useProgram(this.kawaseDownProg);
    const uDownTex = gl.getUniformLocation(this.kawaseDownProg, 'u_Texture');
    const uDownTexel = gl.getUniformLocation(this.kawaseDownProg, 'u_TexelSize');
    const uDownOffset = gl.getUniformLocation(this.kawaseDownProg, 'u_Offset');

    if (uDownTex) gl.uniform1i(uDownTex, 0);
    if (uDownOffset) gl.uniform1f(uDownOffset, 1.5);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboQuarter.framebuffer);
    gl.viewport(0, 0, this.quarterW, this.quarterH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboHalfA.texture);
    if (uDownTexel) gl.uniform2f(uDownTexel, 1.0 / this.halfW, 1.0 / this.halfH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Downsample 2: fboQuarter -> fboEighth
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboEighth.framebuffer);
    gl.viewport(0, 0, this.eighthW, this.eighthH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboQuarter.texture);
    if (uDownTexel) gl.uniform2f(uDownTexel, 1.0 / this.quarterW, 1.0 / this.quarterH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Upsample 1: fboEighth -> fboQuarter
    gl.useProgram(this.kawaseUpProg);
    const uUpTex = gl.getUniformLocation(this.kawaseUpProg, 'u_Texture');
    const uUpTexel = gl.getUniformLocation(this.kawaseUpProg, 'u_TexelSize');
    const uUpOffset = gl.getUniformLocation(this.kawaseUpProg, 'u_Offset');

    if (uUpTex) gl.uniform1i(uUpTex, 0);
    if (uUpOffset) gl.uniform1f(uUpOffset, 1.5);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboQuarter.framebuffer);
    gl.viewport(0, 0, this.quarterW, this.quarterH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboEighth.texture);
    if (uUpTexel) gl.uniform2f(uUpTexel, 1.0 / this.eighthW, 1.0 / this.eighthH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Upsample 2: fboQuarter -> fboHalfB (Bloom target)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboHalfB.framebuffer);
    gl.viewport(0, 0, this.halfW, this.halfH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboQuarter.texture);
    if (uUpTexel) gl.uniform2f(uUpTexel, 1.0 / this.quarterW, 1.0 / this.quarterH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ==========================================
    // Combine: Tier 1 (fboHalfA) + Tier 2 (fboHalfB) -> fboHalfCombine
    // ==========================================
    gl.useProgram(this.combineProg);
    const uCombTier1 = gl.getUniformLocation(this.combineProg, 'u_Tier1Texture');
    const uCombTier2 = gl.getUniformLocation(this.combineProg, 'u_Tier2Texture');
    const uCombBloom = gl.getUniformLocation(this.combineProg, 'u_BloomIntensity');

    if (uCombTier1) gl.uniform1i(uCombTier1, 0);
    if (uCombTier2) gl.uniform1i(uCombTier2, 1);
    if (uCombBloom) gl.uniform1f(uCombBloom, bloomIntensity);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboHalfCombine.framebuffer);
    gl.viewport(0, 0, this.halfW, this.halfH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboHalfA.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fboHalfB.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    return this.fboHalfCombine;
  }

  dispose(): void {
    const gl = this.context.gl;
    this.context.deleteFramebuffer(this.fboHalfA);
    this.context.deleteFramebuffer(this.fboHalfB);
    this.context.deleteFramebuffer(this.fboHalfCombine);
    this.context.deleteFramebuffer(this.fboQuarter);
    this.context.deleteFramebuffer(this.fboEighth);

    gl.deleteProgram(this.bilateralProg);
    gl.deleteProgram(this.kawaseDownProg);
    gl.deleteProgram(this.kawaseUpProg);
    gl.deleteProgram(this.combineProg);
  }
}
