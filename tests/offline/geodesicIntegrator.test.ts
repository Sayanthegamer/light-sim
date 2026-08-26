import { describe, it, expect } from 'vitest';
import {
  integrateGeodesicRK45,
  calculateExactGeodesicAcceleration,
  createRK45Trajectory
} from '../../src/engine/offline/geodesicIntegrator';

describe('Adaptive RK45 Geodesic Integrator (Offline Renderer)', () => {
  const blackHole = {
    center: { x: 0, y: 0 },
    rs: 30.0,
    rInfluence: 360.0 // 12 * rs
  };

  it('calculates zero acceleration at or beyond influence radius', () => {
    const acc = calculateExactGeodesicAcceleration({ x: 400, y: 0 }, blackHole);
    expect(acc.x).toBe(0);
    expect(acc.y).toBe(0);
  });

  it('calculates inward gravitational acceleration directed toward center', () => {
    const acc = calculateExactGeodesicAcceleration({ x: 100, y: 0 }, blackHole);
    expect(acc.x).toBeLessThan(0); // Inward pull
    expect(acc.y).toBeCloseTo(0, 5);
  });

  it('captures photon plunging inside event horizon (r <= rs)', () => {
    const trajectory = createRK45Trajectory(512);
    const incidentRay = {
      origin: { x: -350, y: 0 },
      dir: { x: 1, y: 0 } // Head-on collision
    };

    const result = integrateGeodesicRK45(trajectory, incidentRay, blackHole);
    expect(result.captured).toBe(true);
    expect(result.lastRadius).toBeLessThanOrEqual(blackHole.rs + 1.0);
  });

  it('deflects grazing photon and exits influence sphere moving outward', () => {
    const trajectory = createRK45Trajectory(512);
    // Impact parameter b = 120 (well outside photon sphere b_crit = 3*sqrt(3)/2 * rs ~ 2.598 * 30 ~ 77.9)
    const incidentRay = {
      origin: { x: -350, y: 120 },
      dir: { x: 1, y: 0 }
    };

    const result = integrateGeodesicRK45(trajectory, incidentRay, blackHole);
    expect(result.captured).toBe(false);
    expect(result.escaped).toBe(true);
    expect(result.pointCount).toBeGreaterThan(5);

    // Deflected downward (negative vy)
    const lastVy = trajectory.velocitiesY[result.pointCount - 1];
    expect(lastVy).toBeLessThan(0);
  });

  it('dynamically adapts step size near photon sphere (r ~ 1.5 rs)', () => {
    const trajectory = createRK45Trajectory(1024);
    // Grazing close to photon sphere
    const incidentRay = {
      origin: { x: -350, y: 80 },
      dir: { x: 1, y: 0 }
    };

    const result = integrateGeodesicRK45(trajectory, incidentRay, blackHole, { tolerance: 1e-4 });
    expect(result.pointCount).toBeGreaterThan(10);
    expect(result.minDt).toBeLessThan(result.maxDt);
    expect(result.minDt).toBeLessThan(1.0); // Microsteps taken
  });
});
