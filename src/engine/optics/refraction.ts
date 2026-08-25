/**
 * Physical Optics: Snell's Law, Cauchy Dispersion & Fresnel Energy Conservation
 * Zero-allocation math routines for high-performance optical simulation.
 */

import { Vec2, type IVec2, clamp } from '../math/vec2';

export const WAVELENGTH_RED = 780; // nm
export const WAVELENGTH_VIOLET = 380; // nm

export interface FresnelResult {
  R: number;
  T: number;
  isTIR: boolean;
}

export interface RefractionResult {
  refractedDir: IVec2;
  reflectedDir: IVec2;
  R: number;
  T: number;
  isTIR: boolean;
}

/**
 * Evaluates Cauchy's empirical formula for refractive index:
 * n(\lambda) = A + B / \lambda^2 (where \lambda is in nanometers)
 */
export function cauchyIndex(wavelengthNm: number, A: number, B: number): number {
  const wl = clamp(wavelengthNm, WAVELENGTH_VIOLET, WAVELENGTH_RED);
  return A + B / (wl * wl);
}

/**
 * Maps normalized dispersion parameter u \in [0, 1] to wavelength in nanometers.
 * u = 0 -> Red (780 nm)
 * u = 1 -> Violet (380 nm)
 */
export function dispersionUToWavelength(u: number): number {
  const clampedU = clamp(u, 0.0, 1.0);
  return WAVELENGTH_RED - clampedU * (WAVELENGTH_RED - WAVELENGTH_VIOLET);
}

/**
 * Maps wavelength in nanometers to normalized dispersion parameter u \in [0, 1].
 */
export function wavelengthToDispersionU(wavelengthNm: number): number {
  const clampedWl = clamp(wavelengthNm, WAVELENGTH_VIOLET, WAVELENGTH_RED);
  return (WAVELENGTH_RED - clampedWl) / (WAVELENGTH_RED - WAVELENGTH_VIOLET);
}

/**
 * Computes exact Fresnel reflection (R) and transmission (T) coefficients
 * for unpolarized light (averaging s- and p-polarizations) with strict energy conservation (R + T = 1).
 */
export function fresnelCoefficients(
  cosTheta1: number,
  n1: number,
  n2: number
): FresnelResult {
  const cos1 = clamp(Math.abs(cosTheta1), 0.0, 1.0);
  const eta = n1 / n2;
  const sin2Theta2 = eta * eta * (1.0 - cos1 * cos1);

  if (sin2Theta2 >= 1.0) {
    // Total Internal Reflection
    return {
      R: 1.0,
      T: 0.0,
      isTIR: true
    };
  }

  const cos2 = Math.sqrt(Math.max(0.0, 1.0 - sin2Theta2));

  // Fresnel equations for s- and p-polarization
  const rs = (n1 * cos1 - n2 * cos2) / (n1 * cos1 + n2 * cos2);
  const rp = (n2 * cos1 - n1 * cos2) / (n2 * cos1 + n1 * cos2);

  const R = 0.5 * (rs * rs + rp * rp);
  const clampedR = clamp(R, 0.0, 1.0);
  const T = 1.0 - clampedR;

  return {
    R: clampedR,
    T,
    isTIR: false
  };
}

/**
 * Computes both reflected and refracted ray directions and energy ratios at an optical interface.
 * Mutates destination `result` to avoid memory allocation.
 */
export function solveRefraction(
  result: RefractionResult,
  incidentDir: IVec2,
  normal: IVec2,
  n1: number,
  n2: number
): RefractionResult {
  // Dot product of incident and normal
  let cosI = -(incidentDir.x * normal.x + incidentDir.y * normal.y);
  let normX = normal.x;
  let normY = normal.y;

  // Ensure normal points towards incident medium
  if (cosI < 0) {
    cosI = -cosI;
    normX = -normX;
    normY = -normY;
  }

  // Reflected direction: R = I + 2 * cosI * N
  result.reflectedDir.x = incidentDir.x + 2.0 * cosI * normX;
  result.reflectedDir.y = incidentDir.y + 2.0 * cosI * normY;
  Vec2.normalize(result.reflectedDir, result.reflectedDir);

  // Snell refraction
  const eta = n1 / n2;
  const sin2T = eta * eta * (1.0 - cosI * cosI);

  if (sin2T >= 1.0) {
    // TIR
    result.isTIR = true;
    result.R = 1.0;
    result.T = 0.0;
    result.refractedDir.x = 0;
    result.refractedDir.y = 0;
    return result;
  }

  const cosT = Math.sqrt(Math.max(0.0, 1.0 - sin2T));
  const factor = eta * cosI - cosT;

  result.refractedDir.x = eta * incidentDir.x + factor * normX;
  result.refractedDir.y = eta * incidentDir.y + factor * normY;
  Vec2.normalize(result.refractedDir, result.refractedDir);

  const fresnel = fresnelCoefficients(cosI, n1, n2);
  result.isTIR = fresnel.isTIR;
  result.R = fresnel.R;
  result.T = fresnel.T;

  return result;
}
