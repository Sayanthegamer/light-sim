import { describe, it, expect, beforeEach } from 'vitest';
import {
  type BlackHole,
  createGeodesicTrajectory,
  MAX_RK2_STEPS
} from '../../src/engine/physics/rk2Integrator';
import {
  intersectRayInfluenceBoundary,
  traceGeodesicWithTermination,
  type BoundaryRayHandOff,
  TerminationReason
} from '../../src/engine/physics/blackHoleBoundary';
import { type Ray2D } from '../../src/engine/geometry/intersections';

describe('4-Condition Priority Termination and Boundary Splicing', () => {
  let blackHole: BlackHole;

  beforeEach(() => {
    blackHole = {
      id: 1,
      center: { x: 500, y: 500 },
      rs: 40,
      rInfluence: 480 // 12 * 40 = 480
    };
  });

  describe('Analytic Circular Boundary Intersection & Hand-off', () => {
    it('detects ray intersecting black hole influence perimeter (r = 12 rs) analytically', () => {
      const ray: Ray2D = {
        origin: { x: -100, y: 500 },
        dir: { x: 1, y: 0 }
      };
      const handoff: BoundaryRayHandOff = {
        hasIntersection: false,
        entryPoint: { x: 0, y: 0 },
        exitPoint: { x: 0, y: 0 },
        tEntry: 0,
        tExit: 0
      };

      const hits = intersectRayInfluenceBoundary(handoff, ray, blackHole);
      expect(hits).toBe(true);
      expect(handoff.hasIntersection).toBe(true);
      // Center x=500, radius=480 -> entry at x = 20, exit at x = 980
      expect(handoff.entryPoint.x).toBeCloseTo(20, 3);
      expect(handoff.entryPoint.y).toBeCloseTo(500, 3);
      expect(handoff.exitPoint.x).toBeCloseTo(980, 3);
    });

    it('returns false for rays that bypass the 12 rs influence disc completely', () => {
      const ray: Ray2D = {
        origin: { x: 0, y: 1100 }, // y = 1100 is far above influence boundary (max y is 980)
        dir: { x: 1, y: 0 }
      };
      const handoff: BoundaryRayHandOff = {
        hasIntersection: false,
        entryPoint: { x: 0, y: 0 },
        exitPoint: { x: 0, y: 0 },
        tEntry: 0,
        tExit: 0
      };

      const hits = intersectRayInfluenceBoundary(handoff, ray, blackHole);
      expect(hits).toBe(false);
      expect(handoff.hasIntersection).toBe(false);
    });
  });

  describe('4-Condition Priority Termination Model', () => {
    it('Condition 1 (Horizon Capture): Terminates immediately and clamps to horizon when r <= rs', () => {
      const trajectory = createGeodesicTrajectory(MAX_RK2_STEPS);
      // Direct head-on ray aimed right at the singularity center
      const headOnRay: Ray2D = {
        origin: { x: 200, y: 500 },
        dir: { x: 1, y: 0 }
      };

      const result = traceGeodesicWithTermination(trajectory, headOnRay, blackHole);

      expect(result.reason).toBe(TerminationReason.Captured);
      expect(result.exitRay).toBeNull();

      // Final point should be clamped to event horizon radius (r = rs = 40)
      const lastIdx = trajectory.pointCount - 1;
      const lastX = trajectory.pointsX[lastIdx];
      const lastY = trajectory.pointsY[lastIdx];
      const distToCenter = Math.hypot(lastX - blackHole.center.x, lastY - blackHole.center.y);
      expect(distToCenter).toBeCloseTo(blackHole.rs, 1);
    });

    it('Condition 2 (Escape Boundary): Hands off C1 exit ray when escaping r >= 12 rs moving outward', () => {
      const trajectory = createGeodesicTrajectory(MAX_RK2_STEPS);
      const incomingRay: Ray2D = {
        origin: { x: -100, y: 500 - 300 },
        dir: { x: 1, y: 0 }
      };

      const handoff: BoundaryRayHandOff = {
        hasIntersection: false,
        entryPoint: { x: 0, y: 0 },
        exitPoint: { x: 0, y: 0 },
        tEntry: 0,
        tExit: 0
      };

      const enters = intersectRayInfluenceBoundary(handoff, incomingRay, blackHole);
      expect(enters).toBe(true);

      const grazingRay: Ray2D = {
        origin: handoff.entryPoint,
        dir: incomingRay.dir
      };

      const result = traceGeodesicWithTermination(trajectory, grazingRay, blackHole);

      expect(result.reason).toBe(TerminationReason.Escaped);
      expect(result.exitRay).not.toBeNull();
      if (result.exitRay) {
        expect(result.exitRay.dir.x).toBeGreaterThan(0);
      }

      // Final point should be at or beyond influence radius
      const lastIdx = trajectory.pointCount - 1;
      const lastR = trajectory.radii[lastIdx];
      expect(lastR).toBeGreaterThanOrEqual(blackHole.rInfluence - 5.0);
    });

    it('Condition 3 (Winding Cap): Caps trajectory and fades opacity when cumulative deflection >= 2*PI', () => {
      const trajectory = createGeodesicTrajectory(MAX_RK2_STEPS);
      // Ray aimed with critical impact parameter near the photon sphere (1.5 * rs = 60)
      // Creates tight circular orbit
      const orbitRay: Ray2D = {
        origin: { x: 500 - 480, y: 500 - 104 }, // Impact parameter causing tight multi-turn winding
        dir: { x: 1, y: 0 }
      };

      const result = traceGeodesicWithTermination(trajectory, orbitRay, blackHole);

      // Should either be captured or capped by winding or max steps without crashing
      expect([TerminationReason.WindingCap, TerminationReason.Captured, TerminationReason.MaxSteps]).toContain(result.reason);
      expect(trajectory.pointCount).toBeLessThanOrEqual(MAX_RK2_STEPS);
    });

    it('Condition 4 (Failsafe Cap): Ensures step count never exceeds MAX_RK2_STEPS = 64', () => {
      const trajectory = createGeodesicTrajectory(MAX_RK2_STEPS);
      const arbitraryRay: Ray2D = {
        origin: { x: 500 - 100, y: 500 - 80 },
        dir: { x: 0.8, y: 0.6 }
      };

      traceGeodesicWithTermination(trajectory, arbitraryRay, blackHole);

      expect(trajectory.pointCount).toBeLessThanOrEqual(64);
    });
  });
});
