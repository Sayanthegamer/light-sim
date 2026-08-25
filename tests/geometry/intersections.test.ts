import { describe, it, expect, beforeEach } from 'vitest';
import {
  intersectRaySegment,
  intersectRayArc,
  findClosestIntersection,
  createHitResult,
  type Segment2D,
  type Arc2D,
  type Ray2D,
  type HitResult
} from '../../src/engine/geometry/intersections';

describe('Analytic 2D Ray-Segment and Ray-Arc Quadratic Intersection Solvers', () => {
  let hitResult: HitResult;

  beforeEach(() => {
    hitResult = createHitResult();
  });

  describe('Ray-Segment Analytic Intersections', () => {
    const segment: Segment2D = {
      id: 1,
      p1: { x: 100, y: 0 },
      p2: { x: 100, y: 200 },
      n1: 1.0,
      n2: 1.5,
      cauchyA: 1.5,
      cauchyB: 4000
    };

    it('detects perpendicular ray-segment hit and computes accurate hit point and normal', () => {
      const ray: Ray2D = {
        origin: { x: 0, y: 100 },
        dir: { x: 1, y: 0 }
      };

      const hit = intersectRaySegment(hitResult, ray, segment);
      expect(hit).toBe(true);
      expect(hitResult.t).toBeCloseTo(100, 5);
      expect(hitResult.point.x).toBeCloseTo(100, 5);
      expect(hitResult.point.y).toBeCloseTo(100, 5);
      // Normal points towards incident ray (x = -1, y = 0)
      expect(hitResult.normal.x).toBeCloseTo(-1, 5);
      expect(hitResult.normal.y).toBeCloseTo(0, 5);
      expect(hitResult.elementId).toBe(1);
      expect(hitResult.n1).toBe(1.0);
      expect(hitResult.n2).toBe(1.5);
    });

    it('returns false when ray shoots away from segment (t < epsilon)', () => {
      const ray: Ray2D = {
        origin: { x: 0, y: 100 },
        dir: { x: -1, y: 0 }
      };

      const hit = intersectRaySegment(hitResult, ray, segment);
      expect(hit).toBe(false);
    });

    it('returns false when ray is parallel to segment', () => {
      const ray: Ray2D = {
        origin: { x: 50, y: 0 },
        dir: { x: 0, y: 1 }
      };

      const hit = intersectRaySegment(hitResult, ray, segment);
      expect(hit).toBe(false);
    });

    it('returns false when ray passes outside segment endpoints', () => {
      const ray: Ray2D = {
        origin: { x: 0, y: 250 },
        dir: { x: 1, y: 0 }
      };

      const hit = intersectRaySegment(hitResult, ray, segment);
      expect(hit).toBe(false);
    });
  });

  describe('Ray-Arc & Circle Analytic Quadratic Intersections', () => {
    // Circle centered at (200, 100) with radius 50 (full 360 circle: 0 to 2pi)
    const circularLens: Arc2D = {
      id: 2,
      center: { x: 200, y: 100 },
      radius: 50,
      startAngle: 0,
      endAngle: 2 * Math.PI,
      nInside: 1.5,
      nOutside: 1.0,
      cauchyA: 1.5,
      cauchyB: 4000
    };

    it('solves quadratic entry intersection on circular lens surface with normal', () => {
      const ray: Ray2D = {
        origin: { x: 100, y: 100 },
        dir: { x: 1, y: 0 }
      };

      const hit = intersectRayArc(hitResult, ray, circularLens);
      expect(hit).toBe(true);
      // Center is at 200, radius is 50, entry is at x = 150 -> distance t = 50
      expect(hitResult.t).toBeCloseTo(50, 5);
      expect(hitResult.point.x).toBeCloseTo(150, 5);
      expect(hitResult.point.y).toBeCloseTo(100, 5);
      // Outward surface normal facing incident ray: (-1, 0)
      expect(hitResult.normal.x).toBeCloseTo(-1, 5);
      expect(hitResult.normal.y).toBeCloseTo(0, 5);
      expect(hitResult.n1).toBe(1.0);
      expect(hitResult.n2).toBe(1.5);
    });

    it('solves exit intersection when ray starts inside circular lens', () => {
      const ray: Ray2D = {
        origin: { x: 200, y: 100 }, // at center
        dir: { x: 1, y: 0 }
      };

      const hit = intersectRayArc(hitResult, ray, circularLens);
      expect(hit).toBe(true);
      expect(hitResult.t).toBeCloseTo(50, 5);
      expect(hitResult.point.x).toBeCloseTo(250, 5);
      expect(hitResult.point.y).toBeCloseTo(100, 5);
      // Normal points against incident inside direction: (-1, 0)
      expect(hitResult.normal.x).toBeCloseTo(-1, 5);
      expect(hitResult.normal.y).toBeCloseTo(0, 5);
      expect(hitResult.n1).toBe(1.5);
      expect(hitResult.n2).toBe(1.0);
    });

    it('respects angular arc bounds on partial arcs', () => {
      // Arc covering top half only: 0 to PI
      const topArc: Arc2D = {
        id: 3,
        center: { x: 200, y: 100 },
        radius: 50,
        startAngle: 0,
        endAngle: Math.PI,
        nInside: 1.5,
        nOutside: 1.0
      };

      // Ray aimed at bottom half (y = 60, below center y = 100, angle in -Y direction)
      const rayBottom: Ray2D = {
        origin: { x: 100, y: 60 },
        dir: { x: 1, y: 0 }
      };
      const hitBottom = intersectRayArc(hitResult, rayBottom, topArc);
      expect(hitBottom).toBe(false);

      // Ray aimed at top half (y = 130, above center y = 100)
      const rayTop: Ray2D = {
        origin: { x: 100, y: 130 },
        dir: { x: 1, y: 0 }
      };
      const hitTop = intersectRayArc(hitResult, rayTop, topArc);
      expect(hitTop).toBe(true);
      expect(hitResult.point.y).toBeCloseTo(130, 5);
    });

    it('returns false for rays that completely miss the circle', () => {
      const ray: Ray2D = {
        origin: { x: 100, y: 200 }, // y=200 is well above circle y in [50, 150]
        dir: { x: 1, y: 0 }
      };

      const hit = intersectRayArc(hitResult, ray, circularLens);
      expect(hit).toBe(false);
    });
  });

  describe('Closest Intersection Selector', () => {
    it('selects the nearest obstacle among multiple segments and arcs', () => {
      const s1: Segment2D = {
        id: 10,
        p1: { x: 300, y: 0 },
        p2: { x: 300, y: 300 },
        n1: 1.0,
        n2: 1.5
      };

      const arc1: Arc2D = {
        id: 20,
        center: { x: 150, y: 150 },
        radius: 30,
        startAngle: 0,
        endAngle: 2 * Math.PI,
        nInside: 1.5,
        nOutside: 1.0
      };

      const ray: Ray2D = {
        origin: { x: 50, y: 150 },
        dir: { x: 1, y: 0 }
      };

      const hit = findClosestIntersection(hitResult, ray, [s1], [arc1]);
      expect(hit).toBe(true);
      expect(hitResult.elementId).toBe(20); // Hits arc at x = 120 first (t = 70), before segment at x = 300 (t = 250)
      expect(hitResult.point.x).toBeCloseTo(120, 5);
    });
  });
});
