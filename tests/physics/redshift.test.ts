import { describe, it, expect } from 'vitest';
import {
  calculateRedshiftFactor,
  calculateShiftedWavelength,
  calculateExtinctionDamping,
  modulateVertexRedshift,
  INFRARED_CUTOFF_NM,
  ULTRAVIOLET_CUTOFF_NM
} from '../../src/engine/physics/redshift';

describe('Vertex-Stage Gravitational Redshift & Extinction Damping Engine', () => {
  const rs = 40; // Schwarzschild radius

  it('verifies spectral cutoff wavelength constants', () => {
    expect(INFRARED_CUTOFF_NM).toBe(780);
    expect(ULTRAVIOLET_CUTOFF_NM).toBe(380);
  });

  describe('Schwarzschild Dilation Factor (1+z)', () => {
    it('evaluates asymptotic unit factor far away from the black hole', () => {
      const factor = calculateRedshiftFactor(40000, rs); // r = 1000 * rs
      expect(factor).toBeCloseTo(1.0, 2);
    });

    it('evaluates exact gravitational dilation factor (1 - rs/r)^(-1/2)', () => {
      // At r = 2 * rs (r = 80): 1+z = 1 / sqrt(1 - 0.5) = sqrt(2) ≈ 1.4142
      const factor = calculateRedshiftFactor(80, rs);
      expect(factor).toBeCloseTo(Math.SQRT2, 3);
    });

    it('clamps dilation near or at the event horizon without division by zero', () => {
      const factorHorizon = calculateRedshiftFactor(40, rs);
      expect(factorHorizon).toBeGreaterThan(30);
      expect(Number.isFinite(factorHorizon)).toBe(true);
    });
  });

  describe('Wavelength Shift & Extinction Damping', () => {
    it('shifts blue/cyan light towards orange/red as it approaches the horizon', () => {
      const lambda0 = 480; // Cyan light (480 nm)
      // At r = 2 * rs: lambda_shifted = 480 * 1.4142 ≈ 678.8 nm (Red)
      const shifted = calculateShiftedWavelength(lambda0, 80, rs);
      expect(shifted).toBeCloseTo(480 * Math.SQRT2, 2);
      expect(shifted).toBeGreaterThan(600);
    });

    it('applies smooth photopic extinction damping beyond 780 nm into infrared', () => {
      // In visible band (550 nm): full transmission (damping = 1.0)
      expect(calculateExtinctionDamping(550)).toBeCloseTo(1.0, 3);

      // At visible edge (780 nm): full transmission
      expect(calculateExtinctionDamping(780)).toBeCloseTo(1.0, 3);

      // Deep infrared (>880 nm): extinguished to black (damping = 0.0)
      expect(calculateExtinctionDamping(900)).toBeCloseTo(0.0, 3);

      // Intermediate infrared (830 nm): smoothly faded
      const midInfrared = calculateExtinctionDamping(830);
      expect(midInfrared).toBeGreaterThan(0.0);
      expect(midInfrared).toBeLessThan(1.0);
    });

    it('modulates vertex dispersionU and intensity seamlessly', () => {
      const out = { dispersionU: 0, intensity: 0 };
      const baseLambda = 500; // Green (500 nm)
      const baseIntensity = 1.0;

      // Far field: preserves green dispersion coordinate
      modulateVertexRedshift(out, baseLambda, baseIntensity, 40000, rs);
      expect(out.intensity).toBeCloseTo(1.0, 2);
      expect(out.dispersionU).toBeCloseTo((780 - 500) / 400, 2);

      // Deep potential well (r = 1.1 * rs): shifted into deep infrared -> intensity extinguished
      modulateVertexRedshift(out, baseLambda, baseIntensity, 44, rs);
      expect(out.intensity).toBeLessThan(0.01);
    });
  });
});
