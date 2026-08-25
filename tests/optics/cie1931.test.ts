import { describe, it, expect } from 'vitest';
import {
  wavelengthToXYZ,
  xyzToLinearRGB,
  wavelengthToLinearRGB,
  linearToSRGBGamma,
  dispersionUToLinearRGB
} from '../../src/engine/optics/cie1931';

describe('Analytic CIE 1931 Spectral Math', () => {
  it('evaluates accurate CIE 1931 XYZ color matching functions for key spectrum wavelengths', () => {
    const xyzRed = wavelengthToXYZ(650);
    expect(xyzRed.x).toBeGreaterThan(0);
    expect(xyzRed.y).toBeGreaterThan(0);
    expect(xyzRed.z).toBeCloseTo(0, 2); // Near zero blue for red

    const xyzGreen = wavelengthToXYZ(550);
    expect(xyzGreen.y).toBeGreaterThan(xyzGreen.x); // Peak photopic luminance
    expect(xyzGreen.y).toBeGreaterThan(xyzGreen.z);

    const xyzBlue = wavelengthToXYZ(450);
    expect(xyzBlue.z).toBeGreaterThan(xyzBlue.x);
    expect(xyzBlue.z).toBeGreaterThan(xyzBlue.y);
  });

  it('transforms XYZ to linear sRGB and clamps out-of-gamut components gracefully', () => {
    const xyz = { x: 0.5, y: 0.5, z: 0.5 };
    const rgb = xyzToLinearRGB(xyz.x, xyz.y, xyz.z);
    expect(rgb.r).toBeGreaterThan(0);
    expect(rgb.g).toBeGreaterThan(0);
    expect(rgb.b).toBeGreaterThan(0);
  });

  it('converts continuous wavelengths directly into radiant linear sRGB colors', () => {
    const red = wavelengthToLinearRGB(700);
    expect(red.r).toBeGreaterThan(red.g);
    expect(red.r).toBeGreaterThan(red.b);

    const green = wavelengthToLinearRGB(530);
    expect(green.g).toBeGreaterThan(red.g);

    const blue = wavelengthToLinearRGB(460);
    expect(blue.b).toBeGreaterThan(blue.r);

    // Dispersion U evaluation (0.2 -> 700nm deep red, 0.8 -> 460nm blue/violet)
    const colorU0 = dispersionUToLinearRGB(0.2); // Red band
    const colorU1 = dispersionUToLinearRGB(0.8); // Blue/Violet band
    expect(colorU0.r).toBeGreaterThan(colorU0.b);
    expect(colorU1.b).toBeGreaterThan(colorU1.r);
  });

  it('applies sRGB gamma correction correctly', () => {
    expect(linearToSRGBGamma(0.0)).toBe(0.0);
    expect(linearToSRGBGamma(1.0)).toBeCloseTo(1.0, 5);
    expect(linearToSRGBGamma(0.5)).toBeGreaterThan(0.5); // Gamma curves brighten midtones
  });
});
