/**
 * Pass 1: Forward Beam Quad Rasterizer
 *
 * Rasterizes 24-byte interleaved beam and ribbon quad meshes into an HDR framebuffer
 * using additive blending (SRC_ALPHA, ONE), disabled backface culling, and CIE 1931 spectral shaders.
 */

import { WebGLContextManager, type FramebufferResource } from './webglContext';
import { VboPacker, VERTEX_BYTE_STRIDE } from '../geometry/vboPacker';
import beamVertShader from '../../shaders/beam.vert';
import beamFragShader from '../../shaders/beam.frag';

export class BeamPass {
  private readonly context: WebGLContextManager;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject | null;
  private readonly vbo: WebGLBuffer | null;
  private readonly uResolution: WebGLUniformLocation | null;
  private currentCapacityBytes = 0;

  constructor(context: WebGLContextManager) {
    this.context = context;
    const gl = context.gl;

    this.program = context.createProgram(beamVertShader, beamFragShader);
    this.uResolution = gl.getUniformLocation(this.program, 'u_Resolution');

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    // Interleaved Layout: 24 bytes per vertex
    // 0..7:   a_Position (Float32 x 2)
    // 8..11:  a_Intensity (Float32 x 1)
    // 12..15: a_DispersionU (Float32 x 1)
    // 16..19: a_EdgeV (Float32 x 1)
    // 20..23: a_ParentColorRGB (Uint8 x 4, normalized)
    const locPosition = gl.getAttribLocation(this.program, 'a_Position');
    const locIntensity = gl.getAttribLocation(this.program, 'a_Intensity');
    const locDispersionU = gl.getAttribLocation(this.program, 'a_DispersionU');
    const locEdgeV = gl.getAttribLocation(this.program, 'a_EdgeV');
    const locParentColorRGB = gl.getAttribLocation(this.program, 'a_ParentColorRGB');

    if (locPosition !== -1) {
      gl.enableVertexAttribArray(locPosition);
      gl.vertexAttribPointer(locPosition, 2, gl.FLOAT, false, VERTEX_BYTE_STRIDE, 0);
    }
    if (locIntensity !== -1) {
      gl.enableVertexAttribArray(locIntensity);
      gl.vertexAttribPointer(locIntensity, 1, gl.FLOAT, false, VERTEX_BYTE_STRIDE, 8);
    }
    if (locDispersionU !== -1) {
      gl.enableVertexAttribArray(locDispersionU);
      gl.vertexAttribPointer(locDispersionU, 1, gl.FLOAT, false, VERTEX_BYTE_STRIDE, 12);
    }
    if (locEdgeV !== -1) {
      gl.enableVertexAttribArray(locEdgeV);
      gl.vertexAttribPointer(locEdgeV, 1, gl.FLOAT, false, VERTEX_BYTE_STRIDE, 16);
    }
    if (locParentColorRGB !== -1) {
      gl.enableVertexAttribArray(locParentColorRGB);
      gl.vertexAttribPointer(locParentColorRGB, 4, gl.UNSIGNED_BYTE, true, VERTEX_BYTE_STRIDE, 20);
    }

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  begin(targetFbo: FramebufferResource, width: number, height: number): void {
    const gl = this.context.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo.framebuffer);
    gl.viewport(0, 0, width, height);

    // Clear previous frame beam energy
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Additive blending for volumetric energy accumulation
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    // Disable culling for inverted double-sided caustic ribbons
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);

    gl.useProgram(this.program);
    if (this.uResolution) {
      gl.uniform2f(this.uResolution, width, height);
    }
  }

  render(packer: VboPacker): void {
    const vertexCount = packer.getVertexCount();
    if (vertexCount === 0) {
      return;
    }

    const gl = this.context.gl;
    const byteLength = packer.getByteLength();

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    // Ensure GPU buffer capacity
    if (byteLength > this.currentCapacityBytes) {
      gl.bufferData(gl.ARRAY_BUFFER, packer.getRawBuffer(), gl.DYNAMIC_DRAW);
      this.currentCapacityBytes = packer.getRawBuffer().byteLength;
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, packer.getFloat32View().subarray(0, vertexCount * 6));
    }

    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  dispose(): void {
    const gl = this.context.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.vbo) gl.deleteBuffer(this.vbo);
    if (this.program) gl.deleteProgram(this.program);
  }
}
