import { describe, it, expect, beforeEach } from 'vitest';
import {
  type BlackHole,
  type GeodesicTrajectory,
  createGeodesicTrajectory,
  calculateAdaptiveDt,
  calculateGravitationalAcceleration,
  stepRK2,
  integrateGeodesic,
  MAX_RK2_STEPS
} from '../../src/engine/physics/rk2Integrator';
import { type Ray2D } from '../../src/engine/geometry/intersections';

describe('Distance-Mapped Adaptive RK2 Geodesic Integrator', () => {
  let blackHole: BlackHole;
  let trajectory: GeodesicTrajectory;

  beforeEach(() => {
    blackHole = {
      id: 1,
      center: { x: 500, y: 500 },
      rs: 40,
      rInfluence: 480 // 12 * rs = 480
    };
    trajectory = createGeodesicTrajectory(MAX_RK2_STEPS);
  });

  it('verifies max RK2 step budget constant is 64', () => {
    expect(MAX_RK2_STEPS).toBe(64);
  });

  it('scales adaptive step size dt smoothly with distance from singularity', () => {
    // Near photon sphere / horizon (r = rs = 40): dt should equal dtMin
    const dtHorizon = calculateAdaptiveDt(40, blackHole.rs, blackHole.rInfluence, 0.5, 10.0);
    expect(dtHorizon).toBeCloseTo(0.5, 3);

    // At outer boundary (r = 12 * rs = 480): dt should equal dtMax
    const dtOuter = calculateAdaptiveDt(480, blackHole.rs, blackHole.rInfluence, 0.5, 10.0);
    expect(dtOuter).toBeCloseTo(10.0, 3);

    // At midpoint: dt should be between dtMin and dtMax
    const dtMid = calculateAdaptiveDt(260, blackHole.rs, blackHole.rInfluence, 0.5, 10.0);
    expect(dtMid).toBeGreaterThan(0.5);
    expect(dtMid).toBeLessThan(10.0);
  });

  it('computes gravitational acceleration with smoothstep boundary fade over [10 rs, 12 rs]', () => {
    const acc = { x: 0, y: 0 };

    // Far outside influence zone (r = 600 > 12 * rs = 480): acceleration is 0
    calculateGravitationalAcceleration(acc, { x: 1100, y: 500 }, blackHole);
    expect(acc.x).toBe(0);
    expect(acc.y).toBe(0);

    // Inside strong gravity field (r = 80 = 2 rs): acceleration points toward center (negative X)
    calculateGravitationalAcceleration(acc, { x: 580, y: 500 }, blackHole);
    expect(acc.x).toBeLessThan(0);
    expect(acc.y).toBeCloseTo(0, 5);
  });

  it('advances photon state using second-order Runge-Kutta midpoint integration', () => {
    const pos = { x: 500, y: 300 }; // r = 200 from center (500, 500), directly above
    const vel = { x: 1, y: 0 };    // moving right (+X)
    const nextPos = { x: 0, y: 0 };
    const nextVel = { x: 0, y: 0 };

    stepRK2(nextPos, nextVel, pos, vel, blackHole, 2.0);

    // Position advances to the right
    expect(nextPos.x).toBeGreaterThan(pos.x);
    // Gravity pulls velocity downward (+Y towards y=500)
    expect(nextVel.y).toBeGreaterThan(0);
  });

  it('integrates geodesic trajectory and bends light around the black hole', () => {
    // Ray aimed horizontally above the black hole (impact parameter b = 150 px)
    const ray: Ray2D = {
      origin: { x: 100, y: 350 },
      dir: { x: 1, y: 0 }
    };

    const count = integrateGeodesic(trajectory, ray, blackHole);

    expect(count).toBeGreaterThan(5);
    expect(count).toBeLessThanOrEqual(MAX_RK2_STEPS);
    expect(trajectory.pointCount).toBe(count);

    // Last point should have deflected downward (y > initial y)
    const lastIdx = count - 1;
    expect(trajectory.pointsY[lastIdx]).toBeGreaterThan(350);
  });
});
