/**
 * Vertex-Stage Gravitational Redshift & Extinction Damping Engine
 *
 * Evaluates Schwarzschild gravitational time dilation (1+z) = (1 - rs/r)^(-1/2),
 * shifts emitted photons towards longer wavelengths, re-normalizes them into the
 * CIE 1931 dispersion coordinate u in [0, 1], and damps radiant intensity beyond 780 nm.
 */

import { smoothstep } from '../math/vec2';
import { wavelengthToDispersionU } from '../optics/refraction';

export const INFRARED_CUTOFF_NM = 780;
export const ULTRAVIOLET_CUTOFF_NM = 380;
export const EXTINCTION_FADE_WIDTH_NM = 100;

export interface VertexModulationResult {
  dispersionU: number;
  intensity: number;
}

/**
 * Computes Schwarzschild gravitational time dilation factor (1+z):
 * 1 + z = 1 / sqrt(max(1 - rs / r, 0.001))
 */
export function calculateRedshiftFactor(r: number, rs: number): number {
  const safeR = Math.max(1e-5, r);
  const ratio = Math.max(0.001, 1.0 - rs / safeR);
  return 1.0 / Math.sqrt(ratio);
}

/**
 * Computes gravitationally shifted wavelength:
 * lambda_shifted = lambda_0 * (1 + z)
 */
export function calculateShiftedWavelength(
  lambda0: number,
  r: number,
  rs: number
): number {
  const factor = calculateRedshiftFactor(r, rs);
  return lambda0 * factor;
}

/**
 * Evaluates smooth photopic extinction damping for wavelengths shifted outside the visible spectrum:
 * Visibly fades to 0 beyond 780 nm (infrared) or below 380 nm (ultraviolet).
 */
export function calculateExtinctionDamping(lambdaShifted: number): number {
  if (lambdaShifted > INFRARED_CUTOFF_NM) {
    const fadeEnd = INFRARED_CUTOFF_NM + EXTINCTION_FADE_WIDTH_NM;
    return smoothstep(fadeEnd, INFRARED_CUTOFF_NM, lambdaShifted);
  }

  if (lambdaShifted < ULTRAVIOLET_CUTOFF_NM) {
    const fadeEnd = ULTRAVIOLET_CUTOFF_NM - EXTINCTION_FADE_WIDTH_NM;
    return smoothstep(fadeEnd, ULTRAVIOLET_CUTOFF_NM, lambdaShifted);
  }

  return 1.0;
}

/**
 * Modulates vertex dispersion parameter u and intensity for a photon at radius r from a black hole.
 * Mutates destination `out` object in place.
 */
export function modulateVertexRedshift(
  out: VertexModulationResult,
  baseLambda: number,
  baseIntensity: number,
  r: number,
  rs: number
): void {
  const shiftedWl = calculateShiftedWavelength(baseLambda, r, rs);
  const damping = calculateExtinctionDamping(shiftedWl);

  out.dispersionU = wavelengthToDispersionU(shiftedWl);
  out.intensity = baseIntensity * damping;
}
