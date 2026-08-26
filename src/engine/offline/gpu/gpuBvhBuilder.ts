/**
 * GPU 2D Bounding Volume Hierarchy (BVH) Builder
 *
 * Constructs a balanced 2D spatial hierarchy from scene primitives and flattens
 * it into an array of 32-byte IGpuBVHNode records.
 * Ensures the maximum tree depth never exceeds 8 levels to guarantee safe short-stack
 * traversal inside WGSL compute shaders with zero stack overflow.
 */

import { type IVec2 } from '../../math/vec2';
import { type IOfflineSceneGeometry } from '../mcPhotonTracer';
import {
  type IGpuBVHNode,
  BVH_NODE_STRIDE_BYTES,
  encodeBVHNode
} from './gpuPrimitiveLayout';

export interface IBvhPrimitiveItem {
  aabbMin: IVec2;
  aabbMax: IVec2;
  primType: number; // 0 = Segment, 1 = Arc, 2 = BlackHole
  primIndex: number;
}

export interface IGpuBvhResult {
  bvhBuffer: ArrayBuffer;
  nodeCount: number;
  maxDepth: number;
  rootAABB: { minX: number; minY: number; maxX: number; maxY: number };
}

interface IInternalBvhNode {
  aabbMin: IVec2;
  aabbMax: IVec2;
  leftChild: IInternalBvhNode | null;
  rightChild: IInternalBvhNode | null;
  item: IBvhPrimitiveItem | null;
  depth: number;
}

/**
 * Extracts bounding boxes for all geometric primitives in a scene snapshot.
 */
export function extractSceneBvhItems(scene: IOfflineSceneGeometry): IBvhPrimitiveItem[] {
  const items: IBvhPrimitiveItem[] = [];

  let segIndex = 0;
  // 1. Barriers
  for (let i = 0; i < scene.barriers.length; i++) {
    const b = scene.barriers[i];
    items.push({
      aabbMin: {
        x: Math.min(b.p1.x, b.p2.x) - 0.5,
        y: Math.min(b.p1.y, b.p2.y) - 0.5
      },
      aabbMax: {
        x: Math.max(b.p1.x, b.p2.x) + 0.5,
        y: Math.max(b.p1.y, b.p2.y) + 0.5
      },
      primType: 0, // Segment
      primIndex: segIndex++
    });
  }

  // 2. Prisms
  for (let i = 0; i < scene.prisms.length; i++) {
    const p = scene.prisms[i];
    const n = p.vertices.length;
    for (let j = 0; j < n; j++) {
      const v1 = p.vertices[j];
      const v2 = p.vertices[(j + 1) % n];
      items.push({
        aabbMin: {
          x: Math.min(v1.x, v2.x) - 0.5,
          y: Math.min(v1.y, v2.y) - 0.5
        },
        aabbMax: {
          x: Math.max(v1.x, v2.x) + 0.5,
          y: Math.max(v1.y, v2.y) + 0.5
        },
        primType: 0, // Segment
        primIndex: segIndex++
      });
    }
  }

  // 3. Lenses
  let arcIndex = 0;
  for (let i = 0; i < scene.lenses.length; i++) {
    const l = scene.lenses[i];
    for (let j = 0; j < l.arcs.length; j++) {
      const a = l.arcs[j];
      items.push({
        aabbMin: {
          x: a.center.x - a.radius - 0.5,
          y: a.center.y - a.radius - 0.5
        },
        aabbMax: {
          x: a.center.x + a.radius + 0.5,
          y: a.center.y + a.radius + 0.5
        },
        primType: 1, // Arc
        primIndex: arcIndex++
      });
    }

    if (l.segments) {
      for (let j = 0; j < l.segments.length; j++) {
        const seg = l.segments[j];
        items.push({
          aabbMin: {
            x: Math.min(seg.p1.x, seg.p2.x) - 0.5,
            y: Math.min(seg.p1.y, seg.p2.y) - 0.5
          },
          aabbMax: {
            x: Math.max(seg.p1.x, seg.p2.x) + 0.5,
            y: Math.max(seg.p1.y, seg.p2.y) + 0.5
          },
          primType: 0,
          primIndex: segIndex++
        });
      }
    }
  }

  // 4. Black Holes
  for (let i = 0; i < scene.blackHoles.length; i++) {
    const bh = scene.blackHoles[i];
    items.push({
      aabbMin: {
        x: bh.center.x - bh.rInfluence,
        y: bh.center.y - bh.rInfluence
      },
      aabbMax: {
        x: bh.center.x + bh.rInfluence,
        y: bh.center.y + bh.rInfluence
      },
      primType: 2, // BlackHole
      primIndex: i
    });
  }

  return items;
}

/**
 * Builds a balanced 2D BVH from scene geometry or primitive items.
 */
export function buildGpuBVH(
  input: IOfflineSceneGeometry | IBvhPrimitiveItem[],
  fallbackBounds?: { minX: number; minY: number; maxX: number; maxY: number }
): IGpuBvhResult {
  let items: IBvhPrimitiveItem[];
  let bounds: { minX: number; minY: number; maxX: number; maxY: number };

  if (Array.isArray(input)) {
    items = input;
    bounds = fallbackBounds ?? { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  } else {
    items = extractSceneBvhItems(input);
    bounds = input.bounds;
  }

  if (items.length === 0) {
    // Single dummy root node
    const buffer = new ArrayBuffer(BVH_NODE_STRIDE_BYTES);
    const fView = new Float32Array(buffer);
    const uView = new Uint32Array(buffer);
    encodeBVHNode(fView, uView, 0, {
      aabbMin: { x: bounds.minX, y: bounds.minY },
      aabbMax: { x: bounds.maxX, y: bounds.maxY },
      leftChild: 0,
      rightChildOrCount: 0,
      primType: 0,
      primIndex: 0
    });

    return {
      bvhBuffer: buffer,
      nodeCount: 1,
      maxDepth: 1,
      rootAABB: bounds
    };
  }

  let calculatedMaxDepth = 1;

  function buildSubtree(itemList: IBvhPrimitiveItem[], depth: number): IInternalBvhNode {
    calculatedMaxDepth = Math.max(calculatedMaxDepth, depth);

    // Compute bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < itemList.length; i++) {
      const it = itemList[i];
      if (it.aabbMin.x < minX) minX = it.aabbMin.x;
      if (it.aabbMin.y < minY) minY = it.aabbMin.y;
      if (it.aabbMax.x > maxX) maxX = it.aabbMax.x;
      if (it.aabbMax.y > maxY) maxY = it.aabbMax.y;
    }

    if (itemList.length === 1 || depth >= 7) {
      return {
        aabbMin: { x: minX, y: minY },
        aabbMax: { x: maxX, y: maxY },
        leftChild: null,
        rightChild: null,
        item: itemList[0],
        depth
      };
    }

    // Split along widest axis
    const extentX = maxX - minX;
    const extentY = maxY - minY;
    const splitAxis = extentX >= extentY ? 'x' : 'y';

    const sorted = itemList.slice().sort((a, b) => {
      const centerA = splitAxis === 'x' ? (a.aabbMin.x + a.aabbMax.x) * 0.5 : (a.aabbMin.y + a.aabbMax.y) * 0.5;
      const centerB = splitAxis === 'x' ? (b.aabbMin.x + b.aabbMax.x) * 0.5 : (b.aabbMin.y + b.aabbMax.y) * 0.5;
      return centerA - centerB;
    });

    const mid = Math.floor(sorted.length / 2);
    const leftList = sorted.slice(0, mid);
    const rightList = sorted.slice(mid);

    const leftNode = buildSubtree(leftList, depth + 1);
    const rightNode = buildSubtree(rightList, depth + 1);

    return {
      aabbMin: {
        x: Math.min(leftNode.aabbMin.x, rightNode.aabbMin.x),
        y: Math.min(leftNode.aabbMin.y, rightNode.aabbMin.y)
      },
      aabbMax: {
        x: Math.max(leftNode.aabbMax.x, rightNode.aabbMax.x),
        y: Math.max(leftNode.aabbMax.y, rightNode.aabbMax.y)
      },
      leftChild: leftNode,
      rightChild: rightNode,
      item: null,
      depth
    };
  }

  const rootInternal = buildSubtree(items, 1);

  // Flatten into contiguous array of IGpuBVHNode
  const flatNodes: IGpuBVHNode[] = [];

  function flattenNode(node: IInternalBvhNode): number {
    const nodeIndex = flatNodes.length;
    // Reserve slot
    const flatNode: IGpuBVHNode = {
      aabbMin: node.aabbMin,
      aabbMax: node.aabbMax,
      leftChild: 0,
      rightChildOrCount: 0,
      primType: 0,
      primIndex: 0
    };
    flatNodes.push(flatNode);

    if (node.item !== null) {
      // Leaf node
      flatNode.leftChild = 0;
      flatNode.rightChildOrCount = 1;
      flatNode.primType = node.item.primType;
      flatNode.primIndex = node.item.primIndex;
    } else if (node.leftChild && node.rightChild) {
      // Internal node
      const leftIdx = flattenNode(node.leftChild);
      const rightIdx = flattenNode(node.rightChild);
      flatNode.leftChild = leftIdx;
      flatNode.rightChildOrCount = rightIdx;
      flatNode.primType = 0xFFFFFFFF; // Internal node marker
      flatNode.primIndex = 0;
    }

    return nodeIndex;
  }

  flattenNode(rootInternal);

  const bvhBuffer = new ArrayBuffer(flatNodes.length * BVH_NODE_STRIDE_BYTES);
  const fView = new Float32Array(bvhBuffer);
  const uView = new Uint32Array(bvhBuffer);

  for (let i = 0; i < flatNodes.length; i++) {
    encodeBVHNode(fView, uView, i, flatNodes[i]);
  }

  return {
    bvhBuffer,
    nodeCount: flatNodes.length,
    maxDepth: calculatedMaxDepth,
    rootAABB: {
      minX: rootInternal.aabbMin.x,
      minY: rootInternal.aabbMin.y,
      maxX: rootInternal.aabbMax.x,
      maxY: rootInternal.aabbMax.y
    }
  };
}
