/**
 * Pass 2: Obstacle Geometry Mask Rasterizer
 *
 * Rasterizes solid scene element bodies (prisms, lenses, mirrors, barriers, black holes)
 * into a dedicated 1-byte R8 mask texture to prevent bilateral scatter light leakage.
 */

import { WebGLContextManager, type FramebufferResource } from './webglContext';
import { type IVec2 } from '../math/vec2';
import maskVertShader from '../../shaders/mask.vert';
import maskFragShader from '../../shaders/mask.frag';

export interface CircleObstacle {
  center: IVec2;
  radius: number;
}

export class MaskPass {
  private readonly context: WebGLContextManager;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject | null;
  private readonly vbo: WebGLBuffer | null;
  private readonly uResolution: WebGLUniformLocation | null;
  private floatBuffer: Float32Array;
  private capacityFloats: number;

  constructor(context: WebGLContextManager, initialCapacity = 2048) {
    this.context = context;
    const gl = context.gl;

    this.program = context.createProgram(maskVertShader, maskFragShader);
    this.uResolution = gl.getUniformLocation(this.program, 'u_Resolution');

    this.capacityFloats = initialCapacity * 2;
    this.floatBuffer = new Float32Array(this.capacityFloats);

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    const locPosition = gl.getAttribLocation(this.program, 'a_Position');
    if (locPosition !== -1) {
      gl.enableVertexAttribArray(locPosition);
      gl.vertexAttribPointer(locPosition, 2, gl.FLOAT, false, 8, 0);
    }

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  begin(targetMaskFbo: FramebufferResource, width: number, height: number): void {
    const gl = this.context.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetMaskFbo.framebuffer);
    gl.viewport(0, 0, width, height);

    // Clear mask to 0 (air/open space)
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Overwrite solid obstacles without blending
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);

    gl.useProgram(this.program);
    if (this.uResolution) {
      gl.uniform2f(this.uResolution, width, height);
    }
  }

  private ensureCapacity(neededFloats: number): void {
    if (neededFloats > this.capacityFloats) {
      this.capacityFloats = Math.max(neededFloats, this.capacityFloats * 2);
      this.floatBuffer = new Float32Array(this.capacityFloats);
    }
  }

  /**
   * Rasterizes convex or simple polygons (e.g. prisms, barriers) via triangle fan triangulation.
   */
  renderPolygons(polygons: IVec2[][]): void {
    if (polygons.length === 0) return;

    let totalVertices = 0;
    for (let p = 0; p < polygons.length; p++) {
      const poly = polygons[p];
      if (poly.length >= 3) {
        // (N - 2) triangles * 3 vertices
        totalVertices += (poly.length - 2) * 3;
      }
    }

    if (totalVertices === 0) return;

    this.ensureCapacity(totalVertices * 2);
    let offset = 0;

    for (let p = 0; p < polygons.length; p++) {
      const poly = polygons[p];
      if (poly.length < 3) continue;

      const p0 = poly[0];
      for (let i = 1; i < poly.length - 1; i++) {
        const p1 = poly[i];
        const p2 = poly[i + 1];

        this.floatBuffer[offset++] = p0.x;
        this.floatBuffer[offset++] = p0.y;
        this.floatBuffer[offset++] = p1.x;
        this.floatBuffer[offset++] = p1.y;
        this.floatBuffer[offset++] = p2.x;
        this.floatBuffer[offset++] = p2.y;
      }
    }

    const gl = this.context.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.floatBuffer.subarray(0, offset), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, totalVertices);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /**
   * Rasterizes solid circular obstacles (e.g. circular lens bodies or black hole event horizons).
   */
  renderCircles(circles: CircleObstacle[], segmentsPerCircle = 32): void {
    if (circles.length === 0) return;

    const totalVertices = circles.length * segmentsPerCircle * 3;
    this.ensureCapacity(totalVertices * 2);
    let offset = 0;

    const angleStep = (2.0 * Math.PI) / segmentsPerCircle;

    for (let c = 0; c < circles.length; c++) {
      const circle = circles[c];
      const cx = circle.center.x;
      const cy = circle.center.y;
      const r = circle.radius;

      for (let s = 0; s < segmentsPerCircle; s++) {
        const theta1 = s * angleStep;
        const theta2 = (s + 1) * angleStep;

        this.floatBuffer[offset++] = cx;
        this.floatBuffer[offset++] = cy;
        this.floatBuffer[offset++] = cx + r * Math.cos(theta1);
        this.floatBuffer[offset++] = cy + r * Math.sin(theta1);
        this.floatBuffer[offset++] = cx + r * Math.cos(theta2);
        this.floatBuffer[offset++] = cy + r * Math.sin(theta2);
      }
    }

    const gl = this.context.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.floatBuffer.subarray(0, offset), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, totalVertices);
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
