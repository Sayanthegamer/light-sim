/**
 * Pass 4: Extended Reinhard Tonemapping & Composite Blit Engine
 *
 * Fuses the sharp Pass 1 beam HDR buffer and Pass 3 atmospheric scatter buffer,
 * evaluates linear luminance-weighted Extended Reinhard tonemapping (L_white = 4.0),
 * and applies sRGB gamma correction (gamma = 2.2).
 */

import { WebGLContextManager, type FramebufferResource } from './webglContext';
import screenQuadVert from '../../shaders/screenQuad.vert';
import compositeFrag from '../../shaders/compositeTonemap.frag';

/**
 * Computes luminance-weighted Extended Reinhard compression in linear space:
 * L = 0.2126 * r + 0.7152 * g + 0.0722 * b
 * factor = (1 + L / L_white^2) / (1 + L)
 */
export function calculateExtendedReinhardLuminance(
  r: number,
  g: number,
  b: number,
  lWhite = 4.0
): { r: number; g: number; b: number } {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum <= 1e-6) {
    return { r: 0, g: 0, b: 0 };
  }

  const lWhiteSq = lWhite * lWhite;
  const factor = (1.0 + lum / lWhiteSq) / (1.0 + lum);

  return {
    r: r * factor,
    g: g * factor,
    b: b * factor
  };
}

export class CompositePass {
  private readonly context: WebGLContextManager;
  private readonly program: WebGLProgram;

  constructor(context: WebGLContextManager) {
    this.context = context;
    this.program = context.createProgram(screenQuadVert, compositeFrag);
  }

  render(
    targetFbo: FramebufferResource | null,
    beamFbo: FramebufferResource,
    scatterFbo: FramebufferResource,
    maskFbo: FramebufferResource,
    width: number,
    height: number,
    exposure = 1.0,
    whitePoint = 4.0,
    scatterWeight = 1.0
  ): void {
    const gl = this.context.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo ? targetFbo.framebuffer : null);
    gl.viewport(0, 0, width, height);

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    gl.useProgram(this.program);

    const uBeamTex = gl.getUniformLocation(this.program, 'u_BeamTexture');
    const uScatterTex = gl.getUniformLocation(this.program, 'u_ScatterTexture');
    const uMaskTex = gl.getUniformLocation(this.program, 'u_MaskTexture');
    const uExposure = gl.getUniformLocation(this.program, 'u_Exposure');
    const uWhitePoint = gl.getUniformLocation(this.program, 'u_WhitePoint');
    const uScatterWeight = gl.getUniformLocation(this.program, 'u_ScatterWeight');

    if (uBeamTex) gl.uniform1i(uBeamTex, 0);
    if (uScatterTex) gl.uniform1i(uScatterTex, 1);
    if (uMaskTex) gl.uniform1i(uMaskTex, 2);

    if (uExposure) gl.uniform1f(uExposure, exposure);
    if (uWhitePoint) gl.uniform1f(uWhitePoint, whitePoint);
    if (uScatterWeight) gl.uniform1f(uScatterWeight, scatterWeight);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, beamFbo.texture);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, scatterFbo.texture);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, maskFbo.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.context.gl;
    gl.deleteProgram(this.program);
  }
}
