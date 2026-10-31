/**
 * Continuous Spectral Monte Carlo Sampler & Sellmeier Dispersion Library
 *
 * Provides physical Planck blackbody radiation curves, D65 daylight spectra,
 * continuous CIE 1931 XYZ tristimulus integrals, precomputed CDF lookup tables,
 * and 3-term Sellmeier equations for high-precision physical optics.
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
  // Schott SF11 (Dense Flint - High Dispersion)
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

const MIN_WL = 380;
const MAX_WL = 780;
const CDF_STEPS = 160;
const CDF_STEP_SIZE = (MAX_WL - MIN_WL) / CDF_STEPS;

/**
 * Evaluates the refractive index n(\lambda) using the 3-term Sellmeier equation:
 * n^2(\lambda) = 1 + \sum_{i=1}^3 \frac{B_i \lambda^2}{\lambda^2 - C_i}
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
 */
export function planckRadiation(wavelengthNm: number, temperatureK: number): number {
  const wlMeters = wavelengthNm * 1e-9;
  const h = 6.62607015e-34; // Planck constant [J s]
  const c = 2.99792458e8;    // Speed of light [m/s]
  const kB = 1.380649e-23;   // Boltzmann constant [J/K]

  const c1 = 2.0 * h * c * c;
  const c2 = (h * c) / kB;

  const exponent = c2 / (wlMeters * temperatureK);
  if (exponent > 100.0) return 0.0;

  const denom = Math.exp(exponent) - 1.0;
  if (denom <= 0.0) return 0.0;

  return (c1 / Math.pow(wlMeters, 5.0)) / denom;
}

/**
 * Approximates standard CIE D65 Daylight spectrum SPD at wavelength \lambda.
 */
export function d65Radiation(wavelengthNm: number): number {
  const wl = clamp(wavelengthNm, MIN_WL, MAX_WL);
  const u = (wl - 560.0) / 100.0;
  const d = (wl - 460.0) / 30.0;
  return Math.max(0.1, 100.0 * (1.0 - 0.15 * u + 0.1 * Math.exp(-0.5 * d * d)));
}

// Precomputed D65 CDF lookup table (zero per-photon allocation!)
const D65_CDF = new Float32Array(CDF_STEPS + 1);
let d65TotalIntegral = 0;
for (let i = 0; i < CDF_STEPS; i++) {
  const wl = MIN_WL + (i + 0.5) * CDF_STEP_SIZE;
  d65TotalIntegral += d65Radiation(wl) * CDF_STEP_SIZE;
  D65_CDF[i + 1] = d65TotalIntegral;
}

// Cached Planck Blackbody CDF tables keyed by rounded temperature (K)
const PLANCK_CDF_CACHE = new Map<number, { cdf: Float32Array; total: number }>();

function getPlanckCdf(temperatureK: number): { cdf: Float32Array; total: number } {
  const key = Math.max(100, Math.round(temperatureK));
  let entry = PLANCK_CDF_CACHE.get(key);
  if (entry) return entry;

  if (PLANCK_CDF_CACHE.size > 64) {
    PLANCK_CDF_CACHE.clear();
  }

  const cdf = new Float32Array(CDF_STEPS + 1);
  let total = 0;
  for (let i = 0; i < CDF_STEPS; i++) {
    const wl = MIN_WL + (i + 0.5) * CDF_STEP_SIZE;
    total += planckRadiation(wl, key) * CDF_STEP_SIZE;
    cdf[i + 1] = total;
  }

  entry = { cdf, total };
  PLANCK_CDF_CACHE.set(key, entry);
  return entry;
}

function sampleFromCdf(cdf: Float32Array, totalIntegral: number, xi: number): number {
  const clampedXi = clamp(xi, 0.0, 1.0);
  if (totalIntegral <= 0) {
    return MIN_WL + clampedXi * (MAX_WL - MIN_WL);
  }

  const target = clampedXi * totalIntegral;
  let low = 0;
  let high = CDF_STEPS;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (cdf[mid + 1] < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const baseWl = MIN_WL + low * CDF_STEP_SIZE;
  const val0 = cdf[low];
  const val1 = cdf[low + 1];
  const frac = val1 > val0 ? (target - val0) / (val1 - val0) : 0.5;

  return clamp(baseWl + frac * CDF_STEP_SIZE, MIN_WL, MAX_WL);
}

/**
 * Samples a continuous wavelength \lambda \sim [380, 780] nm from a Planck Blackbody curve
 * using cached CDF inversion.
 */
export function samplePlanckWavelength(temperatureK: number, xi: number): number {
  const { cdf, total } = getPlanckCdf(temperatureK);
  return sampleFromCdf(cdf, total, xi);
}

/**
 * Samples a continuous wavelength \lambda \sim [380, 780] nm according to precomputed D65 Daylight SPD.
 */
export function sampleD65Wavelength(xi: number): number {
  return sampleFromCdf(D65_CDF, d65TotalIntegral, xi);
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
      return clamp(param, MIN_WL, MAX_WL);
    case 'blackbody':
      return samplePlanckWavelength(param || 6500, xi);
    case 'd65':
      return sampleD65Wavelength(xi);
    case 'uniform':
    default:
      return MIN_WL + clamp(xi, 0.0, 1.0) * (MAX_WL - MIN_WL);
  }
}

// Precomputed 0.5nm-step CIE 1931 XYZ lookup table for [380, 780] nm (801 entries * 3 floats)
const XYZ_LUT_STEPS = 800;
const XYZ_LUT = new Float32Array((XYZ_LUT_STEPS + 1) * 3);
for (let i = 0; i <= XYZ_LUT_STEPS; i++) {
  const wl = MIN_WL + i * 0.5;
  const xyz = wavelengthToXYZ(wl);
  XYZ_LUT[i * 3 + 0] = xyz.x;
  XYZ_LUT[i * 3 + 1] = xyz.y;
  XYZ_LUT[i * 3 + 2] = xyz.z;
}

/**
 * Zero-allocation CIE 1931 XYZ sample evaluation into an existing target object.
 */
export function wavelengthSampleToXYZInto(
  out: IXyzColor,
  wavelengthNm: number,
  energy: number
): IXyzColor {
  if (wavelengthNm < 360 || wavelengthNm > 830 || energy <= 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  const clamped = clamp(wavelengthNm, MIN_WL, MAX_WL);
  const idxF = (clamped - MIN_WL) * 2.0;
  const idx0 = idxF | 0;
  const idx1 = idx0 < XYZ_LUT_STEPS ? idx0 + 1 : idx0;
  const frac = idxF - idx0;

  const base0 = idx0 * 3;
  const base1 = idx1 * 3;

  out.x = (XYZ_LUT[base0 + 0] + frac * (XYZ_LUT[base1 + 0] - XYZ_LUT[base0 + 0])) * energy;
  out.y = (XYZ_LUT[base0 + 1] + frac * (XYZ_LUT[base1 + 1] - XYZ_LUT[base0 + 1])) * energy;
  out.z = (XYZ_LUT[base0 + 2] + frac * (XYZ_LUT[base1 + 2] - XYZ_LUT[base0 + 2])) * energy;
  return out;
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
  const stepSize = (MAX_WL - MIN_WL) / steps;

  let x = 0;
  let y = 0;
  let z = 0;

  for (let i = 0; i < steps; i++) {
    const wl = MIN_WL + (i + 0.5) * stepSize;
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
