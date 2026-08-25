/**
 * Double-Sided Quad Ribbon Mesh & Caustic Concentration Engine
 *
 * Connects stepped wavefront anchor pairs into unbroken contiguous triangle strips
 * with epsilon-clamped inverse-width caustic scaling (epsilon_pinch = 0.5 px)
 * for non-Euclidean gravitational lensing and caustics.
 */

import { type GeodesicTrajectory } from './rk2Integrator';
import { type VboPacker } from '../geometry/vboPacker';

export const DEFAULT_EPSILON_PINCH = 0.5;

/**
 * Computes Euclidean distance between left and right boundary trajectory points.
 */
export function calculateLocalBeamWidth(
  lx: number,
  ly: number,
  rx: number,
  ry: number
): number {
  const dx = rx - lx;
  const dy = ry - ly;
  return Math.hypot(dx, dy);
}

/**
 * Evaluates inverse-width energy concentration factor:
 * I(n) = I_0 * (w_0 / max(w_n, epsilon_pinch))
 */
export function calculateCausticIntensity(
  baseIntensity: number,
  w0: number,
  wn: number,
  epsilonPinch = DEFAULT_EPSILON_PINCH
): number {
  const clampedWidth = Math.max(wn, epsilonPinch);
  return baseIntensity * (w0 / clampedWidth);
}

/**
 * Generates an unbroken contiguous quad ribbon mesh from paired geodesic trajectories.
 * Writes directly into the pre-allocated VBO packer without intermediate memory allocations.
 */
export function generateRibbonMesh(
  packer: VboPacker,
  leftTrajectory: GeodesicTrajectory,
  rightTrajectory: GeodesicTrajectory,
  baseIntensity: number,
  dispersionU: number,
  tintRGB: [number, number, number],
  epsilonPinch = DEFAULT_EPSILON_PINCH
): number {
  const stepCount = Math.min(leftTrajectory.pointCount, rightTrajectory.pointCount);
  if (stepCount < 2) {
    return 0;
  }

  const w0 = Math.max(
    1e-3,
    calculateLocalBeamWidth(
      leftTrajectory.pointsX[0],
      leftTrajectory.pointsY[0],
      rightTrajectory.pointsX[0],
      rightTrajectory.pointsY[0]
    )
  );

  const [r, g, b] = tintRGB;
  let quadsGenerated = 0;

  for (let n = 0; n < stepCount - 1; n++) {
    const lx0 = leftTrajectory.pointsX[n];
    const ly0 = leftTrajectory.pointsY[n];
    const rx0 = rightTrajectory.pointsX[n];
    const ry0 = rightTrajectory.pointsY[n];

    const lx1 = leftTrajectory.pointsX[n + 1];
    const ly1 = leftTrajectory.pointsY[n + 1];
    const rx1 = rightTrajectory.pointsX[n + 1];
    const ry1 = rightTrajectory.pointsY[n + 1];

    const wn0 = calculateLocalBeamWidth(lx0, ly0, rx0, ry0);
    const wn1 = calculateLocalBeamWidth(lx1, ly1, rx1, ry1);

    const i0 = calculateCausticIntensity(baseIntensity, w0, wn0, epsilonPinch);
    const i1 = calculateCausticIntensity(baseIntensity, w0, wn1, epsilonPinch);

    // Tri 1: (L_n, R_n, L_{n+1})
    packer.writeVertex(lx0, ly0, i0, dispersionU, 0.0, r, g, b);
    packer.writeVertex(rx0, ry0, i0, dispersionU, 1.0, r, g, b);
    packer.writeVertex(lx1, ly1, i1, dispersionU, 0.0, r, g, b);

    // Tri 2: (R_n, R_{n+1}, L_{n+1})
    packer.writeVertex(rx0, ry0, i0, dispersionU, 1.0, r, g, b);
    packer.writeVertex(rx1, ry1, i1, dispersionU, 1.0, r, g, b);
    packer.writeVertex(lx1, ly1, i1, dispersionU, 0.0, r, g, b);

    quadsGenerated++;
  }

  return quadsGenerated;
}
