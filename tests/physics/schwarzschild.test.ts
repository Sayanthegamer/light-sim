import { describe, it, expect } from 'vitest';
import {
  type BlackHole,
  createGeodesicTrajectory,
  integrateGeodesic,
  MAX_RK2_STEPS
} from '../../src/engine/physics/rk2Integrator';

describe('Schwarzschild Deflection Invariants', () => {
  it('Weak-field deflection angle should approach 2 * rs / b', () => {
    const blackHole: BlackHole = {
      id: 1,
      center: { x: 0, y: 0 },
      rs: 10,
      rInfluence: 120 // 12 * 10
    };

    const b = 100; // Impact parameter 10 * rs
    // Start far left
    const ray = {
      origin: { x: -120, y: b },
      dir: { x: 1, y: 0 }
    };

    const trajectory = createGeodesicTrajectory(MAX_RK2_STEPS);
    integrateGeodesic(trajectory, ray, blackHole, MAX_RK2_STEPS);

    // Get final direction
    const lastIdx = trajectory.pointCount - 1;
    const finalVx = trajectory.velocitiesX[lastIdx];
    const finalVy = trajectory.velocitiesY[lastIdx];

    // Initial direction was +x. Deflection angle is atan(finalVy / finalVx)
    // Since gravity pulls towards y=0, finalVy will be negative.
    const deflectionAngle = Math.abs(Math.atan2(finalVy, finalVx));
    
    const expectedDeflection = 2 * blackHole.rs / b; // 2 * 10 / 100 = 0.2 rad

    // Allow 15% tolerance because it's a weak-field approximation and we have a finite influence radius
    expect(deflectionAngle).toBeGreaterThan(expectedDeflection * 0.85);
    expect(deflectionAngle).toBeLessThan(expectedDeflection * 1.15);
  });
});
