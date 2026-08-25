/**
 * Frustum Triangulation & Mesh Generators
 * Generates continuous 2D quad frustum strips and angular spectral triangle fans
 * with zero-allocation VBO packing.
 */

import { Vec2, type IVec2 } from '../math/vec2';
import { type BeamFrustum } from './branchManager';
import { type VboPacker } from './vboPacker';

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
