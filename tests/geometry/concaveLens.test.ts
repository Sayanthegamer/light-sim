import { describe, it, expect } from 'vitest';
import { LensNode, LensType } from '../../src/engine/scene/lensNode';
import { BranchManager } from '../../src/engine/geometry/branchManager';

describe('Concave Lens Geometry Bounds', () => {
  it('Biconcave lens should diverge parallel incoming rays', () => {
    const biconcave = new LensNode('test_biconcave', { x: 100, y: 0 }, 0, {
      lensType: LensType.Biconcave,
      radius1: 80,
      radius2: 80,
      height: 60,
      thickness: 20,
      refractiveIndex: 1.52
    });

    const manager = new BranchManager();
    const arcs = biconcave.getBoundaryArcs();
    const segments = biconcave.getBoundarySegments();

    const upperFrustum = {
      id: 0,
      depth: 0,
      leftRay: { origin: { x: -100, y: 20 }, dir: { x: 1, y: 0 } },
      rightRay: { origin: { x: -100, y: 20.1 }, dir: { x: 1, y: 0 } },
      leftHit: { x: 0, y: 0 },
      rightHit: { x: 0, y: 0 },
      intensity: 1.0,
      dispersionU: -1.0,
      tintRGB: [255, 255, 255] as [number, number, number],
      isDispersed: false
    };
    
    const upperTree = manager.traceLightTree(upperFrustum, segments, arcs);
    
    // Get the last transmitted branch
    const finalUpper = upperTree[upperTree.length - 1];
    expect(finalUpper.leftRay.dir.y).toBeGreaterThan(0.01);

    const lowerFrustum = {
      ...upperFrustum,
      leftRay: { origin: { x: -100, y: -20 }, dir: { x: 1, y: 0 } },
      rightRay: { origin: { x: -100, y: -19.9 }, dir: { x: 1, y: 0 } }
    };
    const lowerTree = manager.traceLightTree(lowerFrustum, segments, arcs);
    const finalLower = lowerTree[lowerTree.length - 1];
    
    expect(finalLower.leftRay.dir.y).toBeLessThan(-0.01);
  });
});
