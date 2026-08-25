import { describe, it, expect } from 'vitest';
import {
  cauchyIndex,
  dispersionUToWavelength,
  wavelengthToDispersionU,
  fresnelCoefficients,
  solveRefraction,
  type RefractionResult
} from '../../src/engine/optics/refraction';
import { Vec2, type IVec2 } from '../../src/engine/math/vec2';

describe('Physical Optics: Snell, Cauchy & Fresnel Solvers', () => {
  it('calculates Cauchy refractive index across wavelength spectrum', () => {
    const A = 1.5;
    const B = 4000; // nm^2

    const nRed = cauchyIndex(780, A, B);
    const nViolet = cauchyIndex(380, A, B);

    expect(nRed).toBeCloseTo(1.5 + 4000 / (780 * 780), 5);
    expect(nViolet).toBeCloseTo(1.5 + 4000 / (380 * 380), 5);
    expect(nViolet).toBeGreaterThan(nRed); // Blue/violet bends more than red
  });

  it('maps normalized dispersion U to and from wavelength (380 - 780 nm)', () => {
    expect(dispersionUToWavelength(0.0)).toBeCloseTo(780, 2); // 0 = Red
    expect(dispersionUToWavelength(1.0)).toBeCloseTo(380, 2); // 1 = Violet
    expect(dispersionUToWavelength(0.5)).toBeCloseTo(580, 2); // Yellow/green

    expect(wavelengthToDispersionU(780)).toBeCloseTo(0.0, 4);
    expect(wavelengthToDispersionU(380)).toBeCloseTo(1.0, 4);
    expect(wavelengthToDispersionU(580)).toBeCloseTo(0.5, 4);
  });

  it('computes Fresnel reflection and transmission with strict energy conservation (R + T = 1)', () => {
    const n1 = 1.0;
    const n2 = 1.5;

    // Normal incidence (theta1 = 0, cosTheta1 = 1.0)
    const normalFresnel = fresnelCoefficients(1.0, n1, n2);
    expect(normalFresnel.isTIR).toBe(false);
    expect(normalFresnel.R).toBeCloseTo(0.04, 3); // (1.5-1)/(1.5+1) ^ 2 = 0.04
    expect(normalFresnel.T).toBeCloseTo(0.96, 3);
    expect(normalFresnel.R + normalFresnel.T).toBeCloseTo(1.0, 6);

    // 45 degrees angle of incidence in air
    const angle45Fresnel = fresnelCoefficients(Math.cos(Math.PI / 4), n1, n2);
    expect(angle45Fresnel.isTIR).toBe(false);
    expect(angle45Fresnel.R).toBeGreaterThan(0.04);
    expect(angle45Fresnel.R + angle45Fresnel.T).toBeCloseTo(1.0, 6);

    // Critical angle / TIR from glass to air (n1 = 1.5, n2 = 1.0)
    // Critical angle is arcsin(1/1.5) = 41.81 degrees
    // Grazing angle 60 deg incidence (cos(60 deg) = 0.5)
    const tirFresnel = fresnelCoefficients(Math.cos(Math.PI / 3), 1.5, 1.0);
    expect(tirFresnel.isTIR).toBe(true);
    expect(tirFresnel.R).toBe(1.0);
    expect(tirFresnel.T).toBe(0.0);
  });

  it('solves full refraction and reflection vectors with zero allocations', () => {
    const incident: IVec2 = { x: 1, y: -1 };
    Vec2.normalize(incident, incident);
    const normal: IVec2 = { x: 0, y: 1 };

    const result: RefractionResult = {
      refractedDir: { x: 0, y: 0 },
      reflectedDir: { x: 0, y: 0 },
      R: 0,
      T: 0,
      isTIR: false
    };

    solveRefraction(result, incident, normal, 1.0, 1.5);

    expect(result.isTIR).toBe(false);
    expect(result.R + result.T).toBeCloseTo(1.0, 5);
    expect(Vec2.len(result.refractedDir)).toBeCloseTo(1.0, 5);
    expect(Vec2.len(result.reflectedDir)).toBeCloseTo(1.0, 5);
    expect(result.reflectedDir.y).toBeGreaterThan(0); // Bounced upwards
    expect(result.refractedDir.y).toBeLessThan(0); // Passed downwards

    // Inverted normal case (incident and normal point in same half-plane)
    const invertedNormal: IVec2 = { x: 0, y: -1 };
    solveRefraction(result, incident, invertedNormal, 1.0, 1.5);
    expect(result.isTIR).toBe(false);
    expect(result.R + result.T).toBeCloseTo(1.0, 5);

    // Total Internal Reflection in solveRefraction
    const steepIncident: IVec2 = { x: 0.3, y: 0.954 };
    Vec2.normalize(steepIncident, steepIncident);
    const verticalNormal: IVec2 = { x: -1, y: 0 };
    solveRefraction(result, steepIncident, verticalNormal, 1.5, 1.0);
    expect(result.isTIR).toBe(true);
    expect(result.R).toBe(1.0);
    expect(result.T).toBe(0.0);
  });
});
