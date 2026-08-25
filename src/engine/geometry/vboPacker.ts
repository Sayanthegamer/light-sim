/**
 * 24-Byte Interleaved VBO Layout & Frustum Triangulation Engine
 *
 * Stride (24 Bytes):
 * Offset 0  (Float32x2): a_Position (x, y in screen px)
 * Offset 8  (Float32)  : a_Intensity (energy concentration / caustic factor w0 / w(t))
 * Offset 12 (Float32)  : a_DispersionU (spectral parameter u in [0, 1] or -1 for un-dispersed)
 * Offset 16 (Float32)  : a_EdgeV (frustum cross-width coordinate v in [0, 1] for Gaussian edge falloff)
 * Offset 20 (Uint8x4)  : a_ParentColorRGB (accumulated Fresnel tint normalized 0-255)
 */

import { Vec2, type IVec2 } from '../math/vec2';
import { type BeamFrustum } from './branchManager';

export const VERTEX_BYTE_STRIDE = 24;
export const FLOATS_PER_VERTEX = 6;
export const BYTES_PER_FLOAT = 4;

export class VboPacker {
  private buffer: ArrayBuffer;
  private floatView: Float32Array;
  private byteView: Uint8Array;
  private vertexCount = 0;
  private capacity: number;

  constructor(initialCapacity = 4096) {
    this.capacity = initialCapacity;
    this.buffer = new ArrayBuffer(this.capacity * VERTEX_BYTE_STRIDE);
    this.floatView = new Float32Array(this.buffer);
    this.byteView = new Uint8Array(this.buffer);
  }

  /**
   * Resets the active vertex counter to 0 for a new frame (zero-allocation).
   */
  reset(): void {
    this.vertexCount = 0;
  }

  /**
   * Returns current number of written vertices.
   */
  getVertexCount(): number {
    return this.vertexCount;
  }

  /**
   * Returns total byte length of written vertex data.
   */
  getByteLength(): number {
    return this.vertexCount * VERTEX_BYTE_STRIDE;
  }

  /**
   * Returns typed Float32 view for gl.bufferSubData uploads.
   */
  getFloat32View(): Float32Array {
    return this.floatView;
  }

  /**
   * Returns typed Uint8 view.
   */
  getUint8View(): Uint8Array {
    return this.byteView;
  }

  /**
   * Returns raw ArrayBuffer.
   */
  getRawBuffer(): ArrayBuffer {
    return this.buffer;
  }

  /**
   * Ensures internal buffer has enough capacity for `count` additional vertices.
   */
  ensureCapacity(additionalVertices: number): void {
    const required = this.vertexCount + additionalVertices;
    if (required > this.capacity) {
      let newCapacity = this.capacity * 2;
      while (newCapacity < required) {
        newCapacity *= 2;
      }
      const newBuffer = new ArrayBuffer(newCapacity * VERTEX_BYTE_STRIDE);
      const newByteView = new Uint8Array(newBuffer);
      newByteView.set(this.byteView.subarray(0, this.vertexCount * VERTEX_BYTE_STRIDE));

      this.buffer = newBuffer;
      this.capacity = newCapacity;
      this.floatView = new Float32Array(this.buffer);
      this.byteView = newByteView;
    }
  }

  /**
   * Writes a single 24-byte interleaved vertex into the buffer.
   */
  writeVertex(
    x: number,
    y: number,
    intensity: number,
    dispersionU: number,
    edgeV: number,
    r: number,
    g: number,
    b: number,
    a = 255
  ): void {
    this.ensureCapacity(1);

    const fIdx = this.vertexCount * FLOATS_PER_VERTEX;
    this.floatView[fIdx + 0] = x;
    this.floatView[fIdx + 1] = y;
    this.floatView[fIdx + 2] = intensity;
    this.floatView[fIdx + 3] = dispersionU;
    this.floatView[fIdx + 4] = edgeV;

    const bIdx = this.vertexCount * VERTEX_BYTE_STRIDE + 20;
    this.byteView[bIdx + 0] = r;
    this.byteView[bIdx + 1] = g;
    this.byteView[bIdx + 2] = b;
    this.byteView[bIdx + 3] = a;

    this.vertexCount++;
  }
}

/**
 * Triangulates a continuous beam frustum into a 2-triangle quad (6 vertices) with caustic concentration scaling.
 */
export function generateQuadFrustumMesh(
  packer: VboPacker,
  frustum: BeamFrustum,
  epsilonPinch = 0.5
): void {
  const l0 = frustum.leftRay.origin;
  const r0 = frustum.rightRay.origin;
  const l1 = frustum.leftHit;
  const r1 = frustum.rightHit;

  const w0 = Vec2.dist(l0, r0);
  const w1 = Vec2.dist(l1, r1);

  const baseIntensity = frustum.intensity;
  const i0 = baseIntensity * (w0 / Math.max(w0, epsilonPinch));
  const i1 = baseIntensity * (w0 / Math.max(w1, epsilonPinch));

  const u = frustum.dispersionU;
  const [r, g, b] = frustum.tintRGB;

  // Tri 1: (L0, R0, L1)
  packer.writeVertex(l0.x, l0.y, i0, u, 0.0, r, g, b);
  packer.writeVertex(r0.x, r0.y, i0, u, 1.0, r, g, b);
  packer.writeVertex(l1.x, l1.y, i1, u, 0.0, r, g, b);

  // Tri 2: (R0, R1, L1)
  packer.writeVertex(r0.x, r0.y, i0, u, 1.0, r, g, b);
  packer.writeVertex(r1.x, r1.y, i1, u, 1.0, r, g, b);
  packer.writeVertex(l1.x, l1.y, i1, u, 0.0, r, g, b);
}

/**
 * Triangulates an angular fan into discrete spectral sub-triangles (for prism rainbows).
 */
export function generateTriangularFanMesh(
  packer: VboPacker,
  apex: IVec2,
  fanPoints: readonly { x: number; y: number; u: number }[],
  intensity: number,
  tintRGB: [number, number, number]
): void {
  if (fanPoints.length < 2) {
    return;
  }

  const [r, g, b] = tintRGB;

  for (let i = 0; i < fanPoints.length - 1; i++) {
    const p0 = fanPoints[i];
    const p1 = fanPoints[i + 1];
    const midU = 0.5 * (p0.u + p1.u);

    // Tri: Apex, P0, P1
    packer.writeVertex(apex.x, apex.y, intensity, midU, 0.5, r, g, b);
    packer.writeVertex(p0.x, p0.y, intensity, p0.u, 0.0, r, g, b);
    packer.writeVertex(p1.x, p1.y, intensity, p1.u, 1.0, r, g, b);
  }
}
