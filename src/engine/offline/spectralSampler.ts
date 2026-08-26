/**
 * Continuous Spectral Monte Carlo Sampler & Sellmeier Dispersion Library
 *
 * Provides physical Planck blackbody radiation curves, D65 daylight spectra,
 * continuous CIE 1931 XYZ tristimulus integrals, and 3-term Sellmeier equations
 * for high-precision physical optics.
 */

import { clamp } from '../math/vec2';
import { wavelengthToXYZ, xyzToLinearRGB, type IXyzColor, type IRgbColor } from '../optics/cie1931';

export interface ISellmeierCoefficients {
  B1: number;
  B2: number;
  B3: number;
  C1: number; // in \mu m^2
  C2: number; // in \mu m^2
  C3: number; // in \mu m^2
}

/**
 * Standard Optical Glass Catalog (Schott / Ohara / Natural Minerals)
 * Coefficients assume wavelength \lambda in micrometers (\mu m).
 */
export const SELLMEIER_GLASSES: Record<string, ISellmeierCoefficients> = {
  // Schott N-BK7 (Standard Borosilicate Crown)
  BK7: {
    B1: 1.03961212,
    B2: 0.231792344,
    B3: 1.01046945,
    C1: 0.00600069867,
    C2: 0.0200179144,
    C3: 103.560653
  },
  // Fused Silica (SiO2)
  FUSED_SILICA: {
    B1: 0.6961663,
    B2: 0.4079426,
    B3: 0.8974794,
    C1: 0.0684043 * 0.0684043,
    C2: 0.1162414 * 0.1162414,
    C3: 9.896161 * 9.896161
  },
  // Sapphire (Al2O3 - Ordinary ray)
  SAPPHIRE: {
    B1: 1.4313493,
    B2: 0.65054713,
    B3: 5.3414021,
    C1: 0.0726631 * 0.0726631,
    C2: 0.1193242 * 0.1193242,
    C3: 18.028251 * 18.028251
  },
  // Natural Diamond (C)
  DIAMOND: {
    B1: 0.3306,
    B2: 4.3356,
    B3: 0.0,
    C1: 0.1750 * 0.1750,
    C2: 0.1060 * 0.1060,
    C3: 0.0
  },
  // Schott SF11 (Dense Dense Flint - High Dispersion)
  FLINT_SF11: {
    B1: 1.73759695,
    B2: 0.313747346,
    B3: 1.89878101,
    C1: 0.013188707,
    C2: 0.0623068142,
    C3: 155.23629
  },
  // Crown K7
  CROWN_K7: {
    B1: 1.1272827,
    B2: 0.1244247,
    B3: 0.8271005,
    C1: 0.0072185,
    C2: 0.0269841,
    C3: 95.83849
  }
};

/**
 * Evaluates the refractive index n(\lambda) using the 3-term Sellmeier equation:
 * n^2(\lambda) = 1 + \sum_{i=1}^3 \frac{B_i \lambda^2}{\lambda^2 - C_i}
 *
 * @param glass Glass name in catalog or custom coefficient set
 * @param wavelengthNm Wavelength in nanometers (e.g. 587.6 nm for yellow helium d-line)
 */
export function evaluateSellmeierIndex(
  glass: string | ISellmeierCoefficients,
  wavelengthNm: number
): number {
  const coeff = typeof glass === 'string' ? SELLMEIER_GLASSES[glass] ?? SELLMEIER_GLASSES.BK7 : glass;

  // Convert wavelength from nm to \mu m
  const lambdaMicrons = wavelengthNm * 0.001;
  const l2 = lambdaMicrons * lambdaMicrons;

  const term1 = (coeff.B1 * l2) / (l2 - coeff.C1);
  const term2 = (coeff.B2 * l2) / (l2 - coeff.C2);
  const term3 = coeff.B3 > 0.0 ? (coeff.B3 * l2) / (l2 - coeff.C3) : 0.0;

  const nSquared = 1.0 + term1 + term2 + term3;
  return Math.sqrt(Math.max(1.0, nSquared));
}

/**
 * Planck Blackbody Spectral Radiance B(\lambda, T)
 * Physical equation: B(\lambda, T) = \frac{2 h c^2}{\lambda^5} \frac{1}{e^{h c / (\lambda k_B T)} - 1}
 *
 * Scaled and normalized for stable computation without numerical underflow/overflow.
 *
 * @param wavelengthNm Wavelength in nanometers [380, 780]
 * @param temperatureK Blackbody temperature in Kelvin (e.g. 3000K incandescent, 5800K solar, 6500K daylight)
 */
export function planckRadiation(wavelengthNm: number, temperatureK: number): number {
  const wlMeters = wavelengthNm * 1e-9;
  const h = 6.62607015e-34; // Planck constant [J s]
  const c = 2.99792458e8;    // Speed of light [m/s]
  const kB = 1.380649e-23;   // Boltzmann constant [J/K]

  const c1 = 2.0 * h * c * c;
  const c2 = (h * c) / kB;

  const exponent = c2 / (wlMeters * temperatureK);
  if (exponent > 100.0) return 0.0; // Negligible tail

  const denom = Math.exp(exponent) - 1.0;
  if (denom <= 0.0) return 0.0;

  // Relative intensity scaled
  const val = (c1 / Math.pow(wlMeters, 5.0)) / denom;
  return val;
}

/**
 * Approximates standard CIE D65 Daylight spectrum SPD at wavelength \lambda.
 */
export function d65Radiation(wavelengthNm: number): number {
  // Approximate D65 relative spectral distribution across visible range
  const wl = clamp(wavelengthNm, 380, 780);
  const u = (wl - 560.0) / 100.0;
  // D65 is roughly flat across 400-700 with a slight hump near 450-480nm and gentle slope
  return Math.max(0.1, 100.0 * (1.0 - 0.15 * u + 0.1 * Math.exp(-0.5 * Math.pow((wl - 460) / 30, 2))));
}

/**
 * Samples a continuous wavelength \lambda \sim [380, 780] nm from a Planck Blackbody curve
 * using precalculated or numerical cumulative distribution function (CDF) inversion.
 */
export function samplePlanckWavelength(temperatureK: number, xi: number): number {
  const clampedXi = clamp(xi, 0.0, 1.0);
  const steps = 80;
  const minWl = 380;
  const maxWl = 780;
  const stepSize = (maxWl - minWl) / steps;

  // Build temporary running integral
  let totalIntegral = 0;
  const cdf = new Float32Array(steps + 1);
  cdf[0] = 0;

  for (let i = 0; i < steps; i++) {
    const wl = minWl + (i + 0.5) * stepSize;
    const rad = planckRadiation(wl, temperatureK);
    totalIntegral += rad * stepSize;
    cdf[i + 1] = totalIntegral;
  }

  if (totalIntegral <= 0) {
    return minWl + clampedXi * (maxWl - minWl);
  }

  const target = clampedXi * totalIntegral;
  // Binary search target in CDF
  let low = 0;
  let high = steps;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (cdf[mid + 1] < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const baseWl = minWl + low * stepSize;
  const val0 = cdf[low];
  const val1 = cdf[low + 1];
  const frac = val1 > val0 ? (target - val0) / (val1 - val0) : 0.5;

  return clamp(baseWl + frac * stepSize, minWl, maxWl);
}

/**
 * Samples a continuous wavelength \lambda \sim [380, 780] nm according to D65 Daylight SPD.
 */
export function sampleD65Wavelength(xi: number): number {
  const clampedXi = clamp(xi, 0.0, 1.0);
  const steps = 80;
  const minWl = 380;
  const maxWl = 780;
  const stepSize = (maxWl - minWl) / steps;

  let totalIntegral = 0;
  const cdf = new Float32Array(steps + 1);
  cdf[0] = 0;

  for (let i = 0; i < steps; i++) {
    const wl = minWl + (i + 0.5) * stepSize;
    const rad = d65Radiation(wl);
    totalIntegral += rad * stepSize;
    cdf[i + 1] = totalIntegral;
  }

  const target = clampedXi * totalIntegral;
  let low = 0;
  let high = steps;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (cdf[mid + 1] < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const baseWl = minWl + low * stepSize;
  const val0 = cdf[low];
  const val1 = cdf[low + 1];
  const frac = val1 > val0 ? (target - val0) / (val1 - val0) : 0.5;

  return clamp(baseWl + frac * stepSize, minWl, maxWl);
}

/**
 * General unified continuous wavelength sampler for any emitter profile.
 */
export function sampleContinuousWavelength(
  spectrumType: 'blackbody' | 'd65' | 'monochromatic' | 'uniform',
  param: number,
  xi: number
): number {
  switch (spectrumType) {
    case 'monochromatic':
      return clamp(param, 380, 780);
    case 'blackbody':
      return samplePlanckWavelength(param || 6500, xi);
    case 'd65':
      return sampleD65Wavelength(xi);
    case 'uniform':
    default:
      return 380 + clamp(xi, 0.0, 1.0) * (780 - 380);
  }
}

/**
 * Converts a monochromatic photon sample (wavelength \lambda, radiant flux / energy)
 * into direct CIE 1931 XYZ tristimulus values.
 */
export function wavelengthSampleToXYZ(wavelengthNm: number, energy: number): IXyzColor {
  const xyz = wavelengthToXYZ(wavelengthNm);
  return {
    x: xyz.x * energy,
    y: xyz.y * energy,
    z: xyz.z * energy
  };
}

/**
 * Integrates an entire continuous Spectral Power Distribution (SPD) function
 * into CIE 1931 XYZ coordinates via Riemann trapezoidal integration.
 */
export function spectralPowerToXYZ(
  spd: (wavelengthNm: number) => number,
  steps: number = 40
): IXyzColor {
  const minWl = 380;
  const maxWl = 780;
  const stepSize = (maxWl - minWl) / steps;

  let x = 0;
  let y = 0;
  let z = 0;

  for (let i = 0; i < steps; i++) {
    const wl = minWl + (i + 0.5) * stepSize;
    const power = spd(wl);
    if (power > 0) {
      const match = wavelengthToXYZ(wl);
      x += match.x * power * stepSize;
      y += match.y * power * stepSize;
      z += match.z * power * stepSize;
    }
  }

  return { x, y, z };
}

export { xyzToLinearRGB, type IXyzColor, type IRgbColor };
