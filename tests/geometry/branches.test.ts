import { describe, it, expect } from 'vitest';
import {
  BranchManager,
  type BeamFrustum,
  MAX_BOUNCE_DEPTH,
  MIN_ENERGY_THRESHOLD,
  MAX_FRUSTUM_POOL
} from '../../src/engine/geometry/branchManager';
import { type Segment2D } from '../../src/engine/geometry/intersections';

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
});
