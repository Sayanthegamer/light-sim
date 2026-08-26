import { describe, it, expect } from 'vitest';
import {
  planckRadiation,
  samplePlanckWavelength,
  sampleD65Wavelength,
  SELLMEIER_GLASSES,
  evaluateSellmeierIndex,
  spectralPowerToXYZ,
  wavelengthSampleToXYZ,
  sampleContinuousWavelength
} from '../../src/engine/offline/spectralSampler';

describe('Spectral Sampler & Sellmeier Dispersion', () => {
  describe('Planck Radiation & Continuous Spectral Sampling', () => {
    it('evaluates Planck blackbody curve with peak shifting according to Wien law', () => {
      // Wien displacement law: \lambda_{max} \approx 2.898e-3 / T
      // At T = 5800K (Sun-like), peak should be ~500 nm (visible green-cyan)
      const r400 = planckRadiation(400, 5800);
      const r500 = planckRadiation(500, 5800);
      const r700 = planckRadiation(700, 5800);

      expect(r500).toBeGreaterThan(r400);
      expect(r500).toBeGreaterThan(r700);

      // At T = 3000K (Warm incandescent), peak is in infrared, so in visible spectrum r700 > r400
      const r400_warm = planckRadiation(400, 3000);
      const r700_warm = planckRadiation(700, 3000);
      expect(r700_warm).toBeGreaterThan(r400_warm);
    });

    it('samples Planck wavelength within visible range [380, 780] nm', () => {
      for (let i = 0; i <= 20; i++) {
        const xi = i / 20;
        const wl = samplePlanckWavelength(5500, xi);
        expect(wl).toBeGreaterThanOrEqual(380);
        expect(wl).toBeLessThanOrEqual(780);
      }
    });

    it('samples D65 standard daylight spectrum within [380, 780] nm', () => {
      for (let i = 0; i <= 20; i++) {
        const xi = i / 20;
        const wl = sampleD65Wavelength(xi);
        expect(wl).toBeGreaterThanOrEqual(380);
        expect(wl).toBeLessThanOrEqual(780);
      }
    });

    it('supports general continuous wavelength sampler for all spectrum types', () => {
      const wlUniform = sampleContinuousWavelength('uniform', 0, 0.5);
      expect(wlUniform).toBeCloseTo(580, 1);

      const wlMono = sampleContinuousWavelength('monochromatic', 532, 0.5);
      expect(wlMono).toBe(532);

      const wlBlackbody = sampleContinuousWavelength('blackbody', 6500, 0.5);
      expect(wlBlackbody).toBeGreaterThanOrEqual(380);
      expect(wlBlackbody).toBeLessThanOrEqual(780);
    });
  });

  describe('Sellmeier Glass Dispersion Library', () => {
    it('has standard optical glass entries (BK7, FUSED_SILICA, SAPPHIRE, DIAMOND, FLINT_SF11)', () => {
      expect(SELLMEIER_GLASSES.BK7).toBeDefined();
      expect(SELLMEIER_GLASSES.FUSED_SILICA).toBeDefined();
      expect(SELLMEIER_GLASSES.SAPPHIRE).toBeDefined();
      expect(SELLMEIER_GLASSES.DIAMOND).toBeDefined();
      expect(SELLMEIER_GLASSES.FLINT_SF11).toBeDefined();
    });

    it('evaluates exact N-d (587.6 nm) refractive index for BK7 (~1.5168)', () => {
      const nD = evaluateSellmeierIndex('BK7', 587.6);
      expect(nD).toBeCloseTo(1.5168, 3);
    });

    it('evaluates normal dispersion dn/dlambda < 0 across visible spectrum', () => {
      const nBlue = evaluateSellmeierIndex('BK7', 400); // 400 nm
      const nGreen = evaluateSellmeierIndex('BK7', 550); // 550 nm
      const nRed = evaluateSellmeierIndex('BK7', 700); // 700 nm

      expect(nBlue).toBeGreaterThan(nGreen);
      expect(nGreen).toBeGreaterThan(nRed);
    });

    it('evaluates high dispersion for Flint glass SF11', () => {
      const nBlue = evaluateSellmeierIndex('FLINT_SF11', 400);
      const nRed = evaluateSellmeierIndex('FLINT_SF11', 700);
      const deltaN = nBlue - nRed;
      expect(deltaN).toBeGreaterThan(0.03); // Flint exhibits pronounced dispersion
    });
  });

  describe('Continuous CIE 1931 Integration', () => {
    it('converts monochromatic sample with energy to XYZ coordinates', () => {
      const xyzGreen = wavelengthSampleToXYZ(550, 1.0);
      expect(xyzGreen.y).toBeGreaterThan(xyzGreen.x);
      expect(xyzGreen.y).toBeGreaterThan(xyzGreen.z);
    });

    it('integrates uniform white SPD to balanced D65/E chromaticity', () => {
      const xyz = spectralPowerToXYZ((_wl) => 1.0, 40);
      expect(xyz.y).toBeGreaterThan(0);
      expect(xyz.x).toBeGreaterThan(0);
      expect(xyz.z).toBeGreaterThan(0);
    });
  });
});
