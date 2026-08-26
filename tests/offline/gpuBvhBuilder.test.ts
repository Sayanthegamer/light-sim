import { describe, it, expect } from 'vitest';
import {
  buildGpuBVH,
  type IBvhPrimitiveItem
} from '../../src/engine/offline/gpu/gpuBvhBuilder';
import { BVH_NODE_STRIDE_BYTES } from '../../src/engine/offline/gpu/gpuPrimitiveLayout';
import { type IOfflineSceneGeometry } from '../../src/engine/offline/mcPhotonTracer';

describe('GPU 2D Bounding Volume Hierarchy (BVH) Builder', () => {
  it('handles empty scene gracefully by generating a single dummy root node', () => {
    const emptyScene: IOfflineSceneGeometry = {
      bounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 },
      emitters: [],
      prisms: [],
      lenses: [],
      barriers: [],
      blackHoles: []
    };

    const bvh = buildGpuBVH(emptyScene);
    expect(bvh.nodeCount).toBe(1);
    expect(bvh.bvhBuffer.byteLength).toBe(BVH_NODE_STRIDE_BYTES);

    const floatView = new Float32Array(bvh.bvhBuffer);
    const uintView = new Uint32Array(bvh.bvhBuffer);

    expect(floatView[0]).toBe(0); // minX
    expect(floatView[1]).toBe(0); // minY
    expect(floatView[2]).toBe(800); // maxX
    expect(floatView[3]).toBe(600); // maxY
    expect(uintView[6]).toBe(0); // isLeaf/primType
  });

  it('builds a valid BVH for a scene with single segment', () => {
    const items: IBvhPrimitiveItem[] = [
      {
        aabbMin: { x: 100, y: 100 },
        aabbMax: { x: 200, y: 150 },
        primType: 0, // Segment
        primIndex: 0
      }
    ];

    const bvh = buildGpuBVH(items, { minX: 0, minY: 0, maxX: 800, maxY: 600 });
    expect(bvh.nodeCount).toBe(1);

    const floatView = new Float32Array(bvh.bvhBuffer);
    const uintView = new Uint32Array(bvh.bvhBuffer);

    expect(floatView[0]).toBe(100);
    expect(floatView[1]).toBe(100);
    expect(floatView[2]).toBe(200);
    expect(floatView[3]).toBe(150);
    expect(uintView[4]).toBe(0); // Leaf flag
    expect(uintView[6]).toBe(0); // Segment
    expect(uintView[7]).toBe(0); // PrimIndex
  });

  it('builds a hierarchical tree for multiple primitives and ensures max depth is within 8 levels', () => {
    const items: IBvhPrimitiveItem[] = [];
    for (let i = 0; i < 32; i++) {
      items.push({
        aabbMin: { x: i * 20, y: i * 15 },
        aabbMax: { x: i * 20 + 15, y: i * 15 + 10 },
        primType: i % 2 === 0 ? 0 : 1,
        primIndex: i
      });
    }

    const bvh = buildGpuBVH(items, { minX: 0, minY: 0, maxX: 1000, maxY: 1000 });
    expect(bvh.nodeCount).toBeGreaterThan(32);
    expect(bvh.maxDepth).toBeLessThanOrEqual(8);

    // Verify root node covers entire bounding box of all items
    const floatView = new Float32Array(bvh.bvhBuffer);
    expect(floatView[0]).toBeLessThanOrEqual(0);
    expect(floatView[1]).toBeLessThanOrEqual(0);
    expect(floatView[2]).toBeGreaterThanOrEqual(31 * 20 + 15);
    expect(floatView[3]).toBeGreaterThanOrEqual(31 * 15 + 10);
  });

  it('builds BVH directly from IOfflineSceneGeometry containing prisms, lenses, and black holes', () => {
    const scene: IOfflineSceneGeometry = {
      bounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 },
      emitters: [{ id: 1, pos: { x: 10, y: 10 }, dir: { x: 1, y: 0 }, width: 10, spectrumType: 'monochromatic', spectrumParam: 500, power: 1 }],
      prisms: [
        {
          id: 2,
          vertices: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 150, y: 200 }]
        }
      ],
      lenses: [
        {
          id: 3,
          arcs: [{ id: 3, center: { x: 400, y: 300 }, radius: 50, startAngle: 0, endAngle: 3.14, nInside: 1.5, nOutside: 1.0 }]
        }
      ],
      barriers: [{ id: 4, p1: { x: 500, y: 50 }, p2: { x: 500, y: 400 }, isMirror: true }],
      blackHoles: [{ id: 5, center: { x: 650, y: 300 }, rs: 30, rInfluence: 360 }]
    };

    const bvh = buildGpuBVH(scene);
    expect(bvh.nodeCount).toBeGreaterThan(5);
    expect(bvh.maxDepth).toBeLessThanOrEqual(8);
    expect(bvh.bvhBuffer.byteLength).toBe(bvh.nodeCount * BVH_NODE_STRIDE_BYTES);
  });
});
