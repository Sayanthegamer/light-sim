import { describe, it, expect } from 'vitest';
import {
  bisectBoundaryDiscontinuity,
  hasDiscontinuity,
  snapToNearestCornerVertex,
  type WavefrontAnchor,
  type CornerVertex
} from '../../src/engine/geometry/bisection';
import { type Segment2D, createHitResult } from '../../src/engine/geometry/intersections';

describe('5-Step Adaptive Bisection Corner Snapping Engine', () => {
  const prismSegments: Segment2D[] = [
    // Prism face 1: from (200, 100) to (250, 200)
    { id: 1, p1: { x: 200, y: 100 }, p2: { x: 250, y: 200 }, n1: 1.0, n2: 1.5 },
    // Prism face 2: from (250, 200) to (150, 200)
    { id: 2, p1: { x: 250, y: 200 }, p2: { x: 150, y: 200 }, n1: 1.0, n2: 1.5 },
    // Prism face 3: from (150, 200) to (200, 100)
    { id: 3, p1: { x: 150, y: 200 }, p2: { x: 200, y: 100 }, n1: 1.0, n2: 1.5 }
  ];

  const corners: CornerVertex[] = [
    { x: 200, y: 100, elementId: 1 },
    { x: 250, y: 200, elementId: 2 },
    { x: 150, y: 200, elementId: 3 }
  ];

  it('detects discontinuity when one anchor hits obstacle and the other misses', () => {
    const hitA = createHitResult();
    hitA.hit = true;
    hitA.elementId = 1;
    hitA.normal = { x: -0.894, y: 0.447 };

    const hitB = createHitResult();
    hitB.hit = false;

    expect(hasDiscontinuity(hitA, hitB)).toBe(true);
  });

  it('detects discontinuity when anchors hit different elements or opposing normals', () => {
    const hitA = createHitResult();
    hitA.hit = true;
    hitA.elementId = 1;
    hitA.normal = { x: -1, y: 0 };

    const hitB = createHitResult();
    hitB.hit = true;
    hitB.elementId = 2;
    hitB.normal = { x: 0, y: 1 };

    expect(hasDiscontinuity(hitA, hitB)).toBe(true);
  });

  it('returns false when both anchors hit the same continuous flat surface', () => {
    const hitA = createHitResult();
    hitA.hit = true;
    hitA.elementId = 1;
    hitA.t = 100;
    hitA.normal = { x: 0, y: 1 };

    const hitB = createHitResult();
    hitB.hit = true;
    hitB.elementId = 1;
    hitB.t = 105;
    hitB.normal = { x: 0, y: 1 };

    expect(hasDiscontinuity(hitA, hitB)).toBe(false);
  });

  it('snaps hit point to vertex if within epsilon < 0.5 px', () => {
    const hitPoint = { x: 200.3, y: 100.2 }; // distance = sqrt(0.09 + 0.04) = 0.36 px (< 0.5 px)
    const snapped = snapToNearestCornerVertex(hitPoint, corners, 0.5);

    expect(snapped).toBe(true);
    expect(hitPoint.x).toBe(200);
    expect(hitPoint.y).toBe(100);
  });

  it('does not snap if distance to nearest vertex exceeds epsilon', () => {
    const hitPoint = { x: 201.0, y: 100.0 }; // distance = 1.0 px (> 0.5 px)
    const snapped = snapToNearestCornerVertex(hitPoint, corners, 0.5);

    expect(snapped).toBe(false);
    expect(hitPoint.x).toBe(201.0);
    expect(hitPoint.y).toBe(100.0);
  });

  it('performs 5-step bisection to find split parameter and snaps to corner apex', () => {
    // Left ray hits prism face 3 (y=105, below apex at y=100)
    // Right ray passes above apex at y=95 and misses into void
    const anchorLeft: WavefrontAnchor = {
      u: 0.0,
      ray: { origin: { x: 50, y: 105 }, dir: { x: 1, y: 0 } }
    };
    const anchorRight: WavefrontAnchor = {
      u: 1.0,
      ray: { origin: { x: 50, y: 95 }, dir: { x: 1, y: 0 } }
    };

    const split = bisectBoundaryDiscontinuity(
      anchorLeft,
      anchorRight,
      prismSegments,
      [],
      corners,
      5,   // 5 iterations -> 10px / 32 = 0.31 px resolution
      0.5  // 0.5 px epsilon
    );

    expect(split).toBeDefined();
    expect(split.uSplit).toBeGreaterThan(0.0);
    expect(split.uSplit).toBeLessThan(1.0);
    // Apex of prism is at (200, 100), corresponding to origin y = 100 -> u = 0.5
    expect(split.uSplit).toBeCloseTo(0.5, 1);
    expect(split.splitHit.point.x).toBeCloseTo(200, 5);
    expect(split.splitHit.point.y).toBeCloseTo(100, 5);
    expect(split.snappedToCorner).toBe(true);
  });
});
