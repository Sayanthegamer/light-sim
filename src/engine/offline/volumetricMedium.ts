/**
 * Volumetric Medium & Monte Carlo Scattering Engine
 *
 * Implements exponential free-flight sampling, Beer-Lambert transmittance,
 * Rayleigh molecular phase functions, and Henyey-Greenstein / Mie aerosol phase functions.
 */

import { clamp } from '../math/vec2';

export type MediumPhaseType = 'rayleigh' | 'henyey-greenstein' | 'isotropic';

export interface IVolumeMedium {
  sigmaA: number; // Absorption coefficient [1/m or 1/px]
  sigmaS: number; // Scattering coefficient [1/m or 1/px]
  sigmaT: number; // Extinction coefficient \sigma_t = \sigma_a + \sigma_s
  albedo: number; // Single-scattering albedo \sigma_s / \sigma_t
  g: number;      // Anisotropy parameter [-0.99, 0.99]
  mediumType: MediumPhaseType;
}

/**
 * Creates a homogeneous participating medium description.
 */
export function createHomogeneousMedium(
  sigmaA: number,
  sigmaS: number,
  g: number = 0.0,
  mediumType: MediumPhaseType = 'henyey-greenstein'
): IVolumeMedium {
  const sa = Math.max(0.0, sigmaA);
  const ss = Math.max(0.0, sigmaS);
  const st = sa + ss;
  const albedo = st > 1e-7 ? ss / st : 0.0;
  const clampedG = clamp(g, -0.99, 0.99);

  return {
    sigmaA: sa,
    sigmaS: ss,
    sigmaT: st,
    albedo,
    g: clampedG,
    mediumType
  };
}

/**
 * Samples the free flight distance before a photon-particle collision
 * according to the exponential Beer-Lambert distribution: s = -\ln(1 - \xi) / \sigma_t.
 *
 * @param sigmaT Extinction coefficient
 * @param xi Uniform random number \in [0, 1)
 */
export function sampleFreeFlightDistance(sigmaT: number, xi: number): number {
  if (sigmaT <= 1e-7) return Infinity;
  const u = clamp(xi, 0.0, 0.9999999);
  const dist = -Math.log(1.0 - u) / sigmaT;
  return Math.max(0.0, dist);
}

/**
 * Evaluates the Beer-Lambert transmittance T(s) = \exp(-\sigma_t \cdot s)
 * across an optical path length s.
 */
export function evaluateVolumeTransmittance(medium: IVolumeMedium, distance: number): number {
  if (distance <= 0.0 || medium.sigmaT <= 1e-7) return 1.0;
  return Math.exp(-medium.sigmaT * distance);
}

/**
 * Evaluates the exact Rayleigh Phase Function for molecular air scattering:
 * p_R(\theta) = \frac{3}{16\pi}(1 + \cos^2\theta)
 *
 * @param cosTheta Cosine of scattering angle \cos\theta \in [-1, 1]
 */
export function rayleighPhaseFunction(cosTheta: number): number {
  const ct = clamp(cosTheta, -1.0, 1.0);
  return (3.0 / (16.0 * Math.PI)) * (1.0 + ct * ct);
}

/**
 * Evaluates the Henyey-Greenstein Phase Function for particulate/dust scattering:
 * p_M(\theta, g) = \frac{1}{4\pi} \frac{1 - g^2}{(1 + g^2 - 2g\cos\theta)^{3/2}}
 *
 * @param cosTheta Cosine of scattering angle \cos\theta \in [-1, 1]
 * @param g Anisotropy parameter \in (-1, 1) (g > 0 forward, g < 0 backward, g = 0 isotropic)
 */
export function henyeyGreensteinPhaseFunction(cosTheta: number, g: number): number {
  const ct = clamp(cosTheta, -1.0, 1.0);
  const clampedG = clamp(g, -0.99, 0.99);

  if (Math.abs(clampedG) < 1e-4) {
    return 1.0 / (4.0 * Math.PI); // Isotropic
  }

  const g2 = clampedG * clampedG;
  const denom = 1.0 + g2 - 2.0 * clampedG * ct;
  return (1.0 / (4.0 * Math.PI)) * ((1.0 - g2) / Math.pow(Math.max(1e-6, denom), 1.5));
}

/**
 * Samples a 2D deflection angle \theta and computes the new unit direction vector
 * after a scattering event.
 *
 * @param dirX Current unit ray direction X
 * @param dirY Current unit ray direction Y
 * @param mediumType Phase function model
 * @param g Anisotropy parameter
 * @param xi1 Random sample for angle magnitude
 * @param xi2 Random sample for deflection sign (+ or -)
 */
export function sampleScatteringDirection2D(
  dirX: number,
  dirY: number,
  mediumType: MediumPhaseType,
  g: number,
  xi1: number,
  xi2: number
): { x: number; y: number } {
  let cosTheta = 0.0;
  const u1 = clamp(xi1, 0.0, 1.0);
  const clampedG = clamp(g, -0.99, 0.99);

  if (mediumType === 'isotropic' || Math.abs(clampedG) < 1e-4) {
    cosTheta = 1.0 - 2.0 * u1;
  } else if (mediumType === 'rayleigh') {
    // Inverse CDF approximation for Rayleigh: (ct + ct^3/3)
    // Approximate with cubic root
    const z = 2.0 * u1 - 1.0;
    cosTheta = Math.cbrt(z);
  } else {
    // Henyey-Greenstein CDF inversion:
    // \cos\theta = \frac{1}{2g} \left[ 1 + g^2 - \left( \frac{1 - g^2}{1 - g + 2g\xi} \right)^2 \right]
    const sqrTerm = (1.0 - clampedG * clampedG) / (1.0 - clampedG + 2.0 * clampedG * u1);
    cosTheta = (1.0 / (2.0 * clampedG)) * (1.0 + clampedG * clampedG - sqrTerm * sqrTerm);
  }

  cosTheta = clamp(cosTheta, -1.0, 1.0);
  let theta = Math.acos(cosTheta);

  // In 2D, choose rotation direction randomly (+ or -)
  if (xi2 < 0.5) {
    theta = -theta;
  }

  // Rotate incoming vector by theta
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  const newX = dirX * cosT - dirY * sinT;
  const newY = dirX * sinT + dirY * cosT;

  const len = Math.hypot(newX, newY);
  return {
    x: len > 1e-6 ? newX / len : 1.0,
    y: len > 1e-6 ? newY / len : 0.0
  };
}
