import { describe, it, expect } from 'vitest';
import {
  advanceWavePhase,
  discretizeApertureToWavelets,
  superposeComplexFields,
  evaluateSingleSlitDiffraction,
  evaluateDoubleSlitInterference
} from '../../src/engine/offline/waveOptics';

describe('Wave Optics & Huygens-Fresnel Wavelet Superposition', () => {
  describe('Phase Evolution', () => {
    it('advances wave phase periodically by 2pi per wavelength', () => {
      const lambda = 500; // 500 nm
      const initialPhase = 0.0;

      const phaseFullCycle = advanceWavePhase(initialPhase, 500, lambda);
      expect(phaseFullCycle).toBeCloseTo(0.0, 4);

      const phaseHalfCycle = advanceWavePhase(initialPhase, 250, lambda);
      expect(phaseHalfCycle).toBeCloseTo(Math.PI, 4);

      const phaseQuarterCycle = advanceWavePhase(initialPhase, 125, lambda);
      expect(phaseQuarterCycle).toBeCloseTo(Math.PI / 2.0, 4);
    });
  });

  describe('Aperture Discretization & Huygens-Fresnel Wavelets', () => {
    it('discretizes aperture segment into evenly spaced secondary wavelets', () => {
      const p1 = { x: 0, y: -10 };
      const p2 = { x: 0, y: 10 };
      const wavelets = discretizeApertureToWavelets(p1, p2, 5, 0.0, 1.0);

      expect(wavelets).toHaveLength(5);
      expect(wavelets[0].origin.y).toBeCloseTo(-8, 3);
      expect(wavelets[2].origin.y).toBeCloseTo(0, 3);
      expect(wavelets[4].origin.y).toBeCloseTo(8, 3);
      expect(wavelets[0].amplitude).toBeCloseTo(0.2, 4);
    });

    it('computes constructive and destructive interference from complex superposition', () => {
      const lambda = 500; // 500 nm

      // Two in-phase sources at equal distance -> Constructive interference (I = (1+1)^2 = 4)
      const constructive = superposeComplexFields([
        { distance: 1000, wavelengthNm: lambda, initialPhase: 0, amplitude: 1.0 },
        { distance: 1000, wavelengthNm: lambda, initialPhase: 0, amplitude: 1.0 }
      ]);
      expect(constructive.intensity).toBeCloseTo(4.0, 4);

      // Two sources with path difference of half wavelength (250 nm) -> Destructive interference (I = 0)
      const destructive = superposeComplexFields([
        { distance: 1000, wavelengthNm: lambda, initialPhase: 0, amplitude: 1.0 },
        { distance: 1250, wavelengthNm: lambda, initialPhase: 0, amplitude: 1.0 }
      ]);
      expect(destructive.intensity).toBeCloseTo(0.0, 4);
    });
  });

  describe('Analytic Slit Diffraction & Interference Profiles', () => {
    it('evaluates single slit Airy/sinc diffraction profile with central maximum', () => {
      const slitWidth = 2000; // 2000 nm (2 \mu m)
      const wavelength = 500; // 500 nm
      const screenDist = 100000; // 100 \mu m

      const centerI = evaluateSingleSlitDiffraction(slitWidth, wavelength, screenDist, 0);
      const firstMinI = evaluateSingleSlitDiffraction(
        slitWidth,
        wavelength,
        screenDist,
        (wavelength * screenDist) / slitWidth
      );

      expect(centerI).toBeCloseTo(1.0, 4);
      expect(firstMinI).toBeLessThan(0.01);
    });

    it('evaluates double slit interference fringes modulating single slit envelope', () => {
      const slitDist = 10000;  // 10 \mu m
      const slitWidth = 2000;  // 2 \mu m
      const wavelength = 500;  // 500 nm
      const screenDist = 100000; // 100 \mu m

      const centerI = evaluateDoubleSlitInterference(slitDist, slitWidth, wavelength, screenDist, 0);
      expect(centerI).toBeCloseTo(1.0, 4);

      // First destructive fringe at y = lambda * L / (2 * d)
      const firstDarkY = (wavelength * screenDist) / (2 * slitDist);
      const darkI = evaluateDoubleSlitInterference(slitDist, slitWidth, wavelength, screenDist, firstDarkY);
      expect(darkI).toBeLessThan(0.05);
    });
  });
});
