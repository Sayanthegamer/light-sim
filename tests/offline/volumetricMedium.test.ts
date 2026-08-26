import { describe, it, expect } from 'vitest';
import {
  sampleFreeFlightDistance,
  rayleighPhaseFunction,
  henyeyGreensteinPhaseFunction,
  sampleScatteringDirection2D,
  evaluateVolumeTransmittance,
  createHomogeneousMedium
} from '../../src/engine/offline/volumetricMedium';

describe('Volumetric Medium & Monte Carlo Scattering', () => {
  describe('Free Flight Distance Sampling & Transmittance', () => {
    it('samples exponential free flight distance inversely proportional to sigmaT', () => {
      const sigmaT = 0.05;
      const s0 = sampleFreeFlightDistance(sigmaT, 0.0);
      const sHalf = sampleFreeFlightDistance(sigmaT, 0.5);
      const sNear1 = sampleFreeFlightDistance(sigmaT, 0.99);

      expect(s0).toBe(0);
      expect(sHalf).toBeCloseTo(-Math.log(0.5) / sigmaT, 4);
      expect(sNear1).toBeGreaterThan(sHalf);
    });

    it('evaluates Beer-Lambert exponential transmittance T(s) = exp(-sigmaT * s)', () => {
      const medium = createHomogeneousMedium(0.01, 0.04, 0.0);
      expect(medium.sigmaT).toBeCloseTo(0.05, 5);
      expect(medium.albedo).toBeCloseTo(0.8, 5); // 0.04 / 0.05

      const trans10 = evaluateVolumeTransmittance(medium, 10);
      expect(trans10).toBeCloseTo(Math.exp(-0.5), 5);
    });
  });

  describe('Phase Functions & Angular Sampling', () => {
    it('evaluates Rayleigh phase function with symmetric forward and backward peaks', () => {
      const pForward = rayleighPhaseFunction(1.0);  // cosTheta = 1
      const pBackward = rayleighPhaseFunction(-1.0); // cosTheta = -1
      const pPerp = rayleighPhaseFunction(0.0);     // cosTheta = 0

      expect(pForward).toBeCloseTo(pBackward, 5);
      expect(pForward).toBeGreaterThan(pPerp);
      expect(pForward / pPerp).toBeCloseTo(2.0, 4);
    });

    it('evaluates Henyey-Greenstein phase function for forward-scattering aerosols (g > 0)', () => {
      const g = 0.7; // Strong forward scattering (Mie dust)
      const pForward = henyeyGreensteinPhaseFunction(1.0, g);
      const pBackward = henyeyGreensteinPhaseFunction(-1.0, g);

      expect(pForward).toBeGreaterThan(pBackward);
      expect(pForward / pBackward).toBeGreaterThan(10.0);
    });

    it('samples 2D perturbed direction preserving unit vector length', () => {
      const dirX = 1.0;
      const dirY = 0.0;

      for (let i = 0; i < 20; i++) {
        const xi1 = i / 20;
        const xi2 = (i * 7) % 20 / 20;
        const newDir = sampleScatteringDirection2D(dirX, dirY, 'henyey-greenstein', 0.6, xi1, xi2);
        const len = Math.hypot(newDir.x, newDir.y);
        expect(len).toBeCloseTo(1.0, 5);
      }
    });
  });
});
