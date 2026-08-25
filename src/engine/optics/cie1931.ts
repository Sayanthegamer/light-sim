/**
 * Analytic CIE 1931 Spectral Math & Color-Matching Functions
 * Based on Wyman, Sloan, Shirley (2013) multi-lobe Gaussian approximations.
 * Maps continuous wavelengths \lambda \in [380, 780] nm directly into linear sRGB and XYZ coordinates.
 */

import { clamp } from '../math/vec2';
import { dispersionUToWavelength } from './refraction';

export interface IXyzColor {
  x: number;
  y: number;
  z: number;
}

export interface IRgbColor {
  r: number;
  g: number;
  b: number;
}

/** Asymmetric Gaussian lobe evaluation */
function gaussian(x: number, mu: number, sigma1: number, sigma2: number): number {
  const t = (x - mu) / (x < mu ? sigma1 : sigma2);
  return Math.exp(-0.5 * t * t);
}

/**
 * Evaluates the analytic CIE 1931 Color Matching Functions:
 * \bar{x}(\lambda), \bar{y}(\lambda), \bar{z}(\lambda)
 */
export function wavelengthToXYZ(wavelengthNm: number): IXyzColor {
  const wl = clamp(wavelengthNm, 380, 780);

  const x =
    1.056 * gaussian(wl, 599.8, 37.9, 31.0) +
    0.362 * gaussian(wl, 442.0, 16.0, 26.7) -
    0.065 * gaussian(wl, 501.1, 20.4, 18.9);

  const y =
    0.821 * gaussian(wl, 568.8, 46.9, 40.5) +
    0.286 * gaussian(wl, 530.9, 16.3, 31.1);

  const z =
    1.217 * gaussian(wl, 437.0, 11.8, 36.0) +
    0.681 * gaussian(wl, 459.0, 26.0, 13.8);

  return {
    x: Math.max(0.0, x),
    y: Math.max(0.0, y),
    z: Math.max(0.0, z)
  };
}

/**
 * Transforms CIE XYZ tristimulus values into Linear sRGB (D65 white point).
 */
export function xyzToLinearRGB(x: number, y: number, z: number): IRgbColor {
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

  return {
    r: Math.max(0.0, r),
    g: Math.max(0.0, g),
    b: Math.max(0.0, b)
  };
}

/**
 * Evaluates continuous linear sRGB color for any monochromatic wavelength \lambda \in [380, 780] nm.
 */
export function wavelengthToLinearRGB(wavelengthNm: number): IRgbColor {
  const xyz = wavelengthToXYZ(wavelengthNm);
  return xyzToLinearRGB(xyz.x, xyz.y, xyz.z);
}

/**
 * Maps normalized dispersion parameter u \in [0, 1] to continuous Linear sRGB.
 * u = 0 -> Red (780 nm)
 * u = 1 -> Violet (380 nm)
 */
export function dispersionUToLinearRGB(u: number): IRgbColor {
  const wl = dispersionUToWavelength(u);
  return wavelengthToLinearRGB(wl);
}

/**
 * Applies sRGB gamma correction (\gamma = 2.2 or piecewise standard sRGB transfer function).
 */
export function linearToSRGBGamma(linearVal: number): number {
  const v = Math.max(0.0, linearVal);
  if (v <= 0.0031308) {
    return 12.92 * v;
  }
  return 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
}
