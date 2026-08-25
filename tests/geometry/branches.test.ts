import { describe, it, expect } from 'vitest';
import {
  BranchManager,
  type BeamFrustum,
  MAX_BOUNCE_DEPTH,
  MIN_ENERGY_THRESHOLD,
  MAX_FRUSTUM_POOL
} from '../../src/engine/geometry/branchManager';
import { type Segment2D, type Arc2D } from '../../src/engine/geometry/intersections';
import { type CornerVertex } from '../../src/engine/geometry/bisection';

describe('Branch Management and Fresnel Energy Culling Engine', () => {
  it('initializes with constants conforming to architectural specifications', () => {
    expect(MAX_BOUNCE_DEPTH).toBe(8);
    expect(MIN_ENERGY_THRESHOLD).toBe(0.005);
    expect(MAX_FRUSTUM_POOL).toBe(32);
  });

  it('prunes branches when intensity drops below 0.005 threshold', () => {
    const manager = new BranchManager();

    const dimBeam: BeamFrustum = {
      id: 1,
      depth: 1,
      leftRay: { origin: { x: 0, y: 100 }, dir: { x: 1, y: 0 } },
      rightRay: { origin: { x: 0, y: 90 }, dir: { x: 1, y: 0 } },
      leftHit: { x: 100, y: 100 },
      rightHit: { x: 100, y: 90 },
      intensity: 0.003, // Below 0.005 threshold
      dispersionU: -1.0,
      tintRGB: [255, 255, 255],
      isDispersed: false
    };

    expect(manager.shouldCull(dimBeam)).toBe(true);

    const visibleBeam: BeamFrustum = {
      ...dimBeam,
      intensity: 0.04 // Above 0.005 threshold (e.g. standard 4% Fresnel reflection)
    };
    expect(manager.shouldCull(visibleBeam)).toBe(false);
  });

  it('prunes branches when bounce depth reaches or exceeds 8', () => {
    const manager = new BranchManager();

    const deepBeam: BeamFrustum = {
      id: 1,
      depth: 8,
      leftRay: { origin: { x: 0, y: 100 }, dir: { x: 1, y: 0 } },
      rightRay: { origin: { x: 0, y: 90 }, dir: { x: 1, y: 0 } },
      leftHit: { x: 100, y: 100 },
      rightHit: { x: 100, y: 90 },
      intensity: 1.0,
      dispersionU: -1.0,
      tintRGB: [255, 255, 255],
      isDispersed: false
    };

    expect(manager.shouldCull(deepBeam)).toBe(true);

    const validDepthBeam: BeamFrustum = {
      ...deepBeam,
      depth: 7
    };
    expect(manager.shouldCull(validDepthBeam)).toBe(false);
  });

  it('traces a beam through a glass block with Fresnel reflection and transmission children', () => {
    const manager = new BranchManager();

    // Vertical glass plate with n=1.5 between x=100 and x=200
    const obstacles: Segment2D[] = [
      { id: 1, p1: { x: 100, y: 0 }, p2: { x: 100, y: 300 }, n1: 1.0, n2: 1.5 },
      { id: 2, p1: { x: 200, y: 0 }, p2: { x: 200, y: 300 }, n1: 1.5, n2: 1.0 }
    ];

    const initialFrustum: BeamFrustum = {
      id: 0,
      depth: 0,
      leftRay: { origin: { x: 0, y: 160 }, dir: { x: 1, y: 0 } },
      rightRay: { origin: { x: 0, y: 140 }, dir: { x: 1, y: 0 } },
      leftHit: { x: 0, y: 0 },
      rightHit: { x: 0, y: 0 },
      intensity: 1.0,
      dispersionU: -1.0,
      tintRGB: [255, 255, 255],
      isDispersed: false
    };

    const frustums = manager.traceLightTree(initialFrustum, obstacles, [], []);

    expect(frustums.length).toBeGreaterThan(1);
    // Root beam hits first interface at x = 100
    expect(frustums[0].leftHit.x).toBeCloseTo(100, 5);
    expect(frustums[0].rightHit.x).toBeCloseTo(100, 5);

    // Should generate transmitted beam through glass and reflected beam back into air
    const transmitted = frustums.find(f => f.depth === 1 && f.leftRay.dir.x > 0);
    expect(transmitted).toBeDefined();
    expect(transmitted!.intensity).toBeCloseTo(0.96, 2); // ~96% Fresnel transmission

    const reflected = frustums.find(f => f.depth === 1 && f.leftRay.dir.x < 0);
    expect(reflected).toBeDefined();
    expect(reflected!.intensity).toBeCloseTo(0.04, 2); // ~4% Fresnel reflection
  });

  it('enforces total internal reflection (TIR) with 100% reflection and 0% transmission', () => {
    const manager = new BranchManager();

    // Glass-to-air interface at x = 100, normal is (-1, 0)
    // Ray inside glass (n1=1.5) traveling at steep angle towards air (n2=1.0)
    const obstacles: Segment2D[] = [
      { id: 1, p1: { x: 100, y: 0 }, p2: { x: 100, y: 300 }, n1: 1.5, n2: 1.0 }
    ];

    // Steep angle ray (incident angle > critical angle ~41.8 deg, e.g. 60 degrees)
    const cos60 = 0.5;
    const sin60 = 0.866;
    const initialFrustum: BeamFrustum = {
      id: 0,
      depth: 0,
      leftRay: { origin: { x: 50, y: 50 }, dir: { x: cos60, y: sin60 } },
      rightRay: { origin: { x: 60, y: 50 }, dir: { x: cos60, y: sin60 } },
      leftHit: { x: 0, y: 0 },
      rightHit: { x: 0, y: 0 },
      intensity: 1.0,
      dispersionU: -1.0,
      tintRGB: [255, 255, 255],
      isDispersed: false
    };

    const frustums = manager.traceLightTree(initialFrustum, obstacles, [], []);

    // Transmitted ray should not exist (or have 0 intensity and be culled)
    const transmitted = frustums.find(f => f.depth === 1 && f.leftRay.dir.x > 0);
    expect(transmitted).toBeUndefined();

    // Reflected ray must have 100% intensity
    const reflected = frustums.find(f => f.depth === 1 && f.leftRay.dir.x < 0);
    expect(reflected).toBeDefined();
    expect(reflected!.intensity).toBeCloseTo(1.0, 5);
  });

  it('correctly focuses a collimated beam when hitting a curved convex circular lens', () => {
    const manager = new BranchManager();

    // Convex lens arc centered at (200, 100) with radius 100
    const lensArc: Arc2D = {
      id: 10,
      center: { x: 200, y: 100 },
      radius: 100,
      startAngle: 0,
      endAngle: 2 * Math.PI,
      nInside: 1.5,
      nOutside: 1.0
    };

    // Parallel beam symmetric around y=100 (left ray at y=130, right ray at y=70)
    const initialFrustum: BeamFrustum = {
      id: 0,
      depth: 0,
      leftRay: { origin: { x: 0, y: 130 }, dir: { x: 1, y: 0 } },
      rightRay: { origin: { x: 0, y: 70 }, dir: { x: 1, y: 0 } },
      leftHit: { x: 0, y: 0 },
      rightHit: { x: 0, y: 0 },
      intensity: 1.0,
      dispersionU: -1.0,
      tintRGB: [255, 255, 255],
      isDispersed: false
    };

    const frustums = manager.traceLightTree(initialFrustum, [], [lensArc], []);
    const transmitted = frustums.find(f => f.depth === 1 && f.leftRay.dir.x > 0);

    expect(transmitted).toBeDefined();
    // Top (left) ray should bend downwards (dir.y < 0)
    expect(transmitted!.leftRay.dir.y).toBeLessThan(0);
    // Bottom (right) ray should bend upwards (dir.y > 0)
    expect(transmitted!.rightRay.dir.y).toBeGreaterThan(0);
  });

  it('splits beam across corner apex using bisection and corner snapping', () => {
    const manager = new BranchManager();

    const prismSegments: Segment2D[] = [
      { id: 1, p1: { x: 200, y: 100 }, p2: { x: 250, y: 200 }, n1: 1.0, n2: 1.5 },
      { id: 2, p1: { x: 250, y: 200 }, p2: { x: 150, y: 200 }, n1: 1.0, n2: 1.5 },
      { id: 3, p1: { x: 150, y: 200 }, p2: { x: 200, y: 100 }, n1: 1.0, n2: 1.5 }
    ];

    const corners: CornerVertex[] = [
      { x: 200, y: 100, elementId: 1 }
    ];

    // Beam straddling prism apex (left ray hits at y=120, right ray passes above at y=80)
    const initialFrustum: BeamFrustum = {
      id: 0,
      depth: 0,
      leftRay: { origin: { x: 50, y: 120 }, dir: { x: 1, y: 0 } },
      rightRay: { origin: { x: 50, y: 80 }, dir: { x: 1, y: 0 } },
      leftHit: { x: 0, y: 0 },
      rightHit: { x: 0, y: 0 },
      intensity: 1.0,
      dispersionU: -1.0,
      tintRGB: [255, 255, 255],
      isDispersed: false
    };

    const frustums = manager.traceLightTree(initialFrustum, prismSegments, [], corners);
    // Should split into at least 2 frustums at root level
    expect(frustums.length).toBeGreaterThanOrEqual(2);
  });

  it('reflects specular beam off flat and curved mirror elements', () => {
    const manager = new BranchManager();

    const mirrorSegment: Segment2D = {
      id: 5,
      p1: { x: 100, y: 0 },
      p2: { x: 100, y: 200 },
      n1: 1.0,
      n2: 1.0,
      isMirror: true
    };

    const initialFrustum: BeamFrustum = {
      id: 0,
      depth: 0,
      leftRay: { origin: { x: 50, y: 120 }, dir: { x: 1, y: 0 } },
      rightRay: { origin: { x: 50, y: 80 }, dir: { x: 1, y: 0 } },
      leftHit: { x: 0, y: 0 },
      rightHit: { x: 0, y: 0 },
      intensity: 1.0,
      dispersionU: -1.0,
      tintRGB: [255, 255, 255],
      isDispersed: false
    };

    const frustums = manager.traceLightTree(initialFrustum, [mirrorSegment], [], []);
    const reflected = frustums.find(f => f.depth === 1);
    expect(reflected).toBeDefined();
    expect(reflected!.intensity).toBeCloseTo(1.0, 5);
    expect(reflected!.leftRay.dir.x).toBeCloseTo(-1.0, 5);
  });

  it('evaluates Cauchy dispersion on spectral beams with dispersionU', () => {
    const manager = new BranchManager();

    const dispersiveSegment: Segment2D = {
      id: 7,
      p1: { x: 100, y: 0 },
      p2: { x: 100, y: 200 },
      n1: 1.0,
      n2: 1.5,
      cauchyA: 1.5,
      cauchyB: 4000
    };

    // Spectral ray (Violet: dispersionU = 1.0, Red: dispersionU = 0.0)
    const violetFrustum: BeamFrustum = {
      id: 0,
      depth: 0,
      leftRay: { origin: { x: 50, y: 110 }, dir: { x: 0.866, y: 0.5 } },
      rightRay: { origin: { x: 50, y: 90 }, dir: { x: 0.866, y: 0.5 } },
      leftHit: { x: 0, y: 0 },
      rightHit: { x: 0, y: 0 },
      intensity: 1.0,
      dispersionU: 1.0, // Violet
      tintRGB: [255, 255, 255],
      isDispersed: true
    };

    const frustums = manager.traceLightTree(violetFrustum, [dispersiveSegment], [], []);
    const transmitted = frustums.find(f => f.depth === 1 && f.leftRay.dir.x > 0);
    expect(transmitted).toBeDefined();
    expect(transmitted!.dispersionU).toBe(1.0);
  });

  it('terminates beam transmission at opaque barrier boundaries', () => {
    const manager = new BranchManager();

    const barrier: Segment2D = {
      id: 9,
      p1: { x: 100, y: 0 },
      p2: { x: 100, y: 200 },
      n1: 1.0,
      n2: 1.0,
      isBarrier: true
    };

    const initialFrustum: BeamFrustum = {
      id: 0,
      depth: 0,
      leftRay: { origin: { x: 0, y: 100 }, dir: { x: 1, y: 0 } },
      rightRay: { origin: { x: 0, y: 80 }, dir: { x: 1, y: 0 } },
      leftHit: { x: 0, y: 0 },
      rightHit: { x: 0, y: 0 },
      intensity: 1.0,
      dispersionU: -1.0,
      tintRGB: [255, 255, 255],
      isDispersed: false
    };

    const frustums = manager.traceLightTree(initialFrustum, [barrier], [], []);
    // Only root frustum exists; no children spawned
    expect(frustums.length).toBe(1);
    expect(frustums[0].leftHit.x).toBeCloseTo(100, 5);
  });
});

