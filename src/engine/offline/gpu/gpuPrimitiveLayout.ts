/**
 * GPU Primitive Binary Layout & Alignment
 *
 * Defines binary struct layouts, byte strides, and typed-array serialization
 * for WGSL Shader Storage Buffer Objects (SSBOs).
 * Strictly enforces 16-byte alignment and maximum cache density with zero dead bytes.
 */

import { type IVec2 } from '../../math/vec2';
import { type IOfflineSceneGeometry } from '../mcPhotonTracer';
import { evaluateSellmeierIndex } from '../spectralSampler';

// Stride Constants (All minimal multiples of 16 bytes for strict WGSL alignment & max cache density)
export const BVH_NODE_STRIDE_BYTES = 32;   // 8 words (32 bytes)
export const SEGMENT_STRIDE_BYTES = 32;    // 8 words (32 bytes)
export const ARC_STRIDE_BYTES = 32;        // 8 words (32 bytes)
export const BLACK_HOLE_STRIDE_BYTES = 16; // 4 words (16 bytes)
export const EMITTER_STRIDE_BYTES = 32;    // 8 words (32 bytes)
export const PHOTON_VERTEX_STRIDE_BYTES = 32; // 8 words (32 bytes)
export const UNIFORM_CONFIG_STRIDE_BYTES = 64; // 16 words (64 bytes)

export interface IGpuBVHNode {
  aabbMin: IVec2;
  aabbMax: IVec2;
  leftChild: number;
  rightChildOrCount: number;
  primType: number; // 0 = Segment, 1 = Arc, 2 = BlackHole
  primIndex: number;
}

export interface IGpuSegment {
  p1: IVec2;
  p2: IVec2;
  n1: number;
  n2: number;
  cauchyA: number;
  cauchyB: number;
  isMirror?: boolean;
  isBarrier?: boolean;
  id?: number;
}

export interface IGpuArc {
  center: IVec2;
  radius: number;
  nGlass: number;
  startAngle: number;
  endAngle: number;
  cauchyA: number;
  cauchyB: number;
  id?: number;
}

export interface IGpuBlackHole {
  center: IVec2;
  rs: number;
  rInfluence: number;
  id?: number;
}

export interface IGpuEmitter {
  pos: IVec2;
  dir: IVec2;
  width: number;
  spectrumType: 'monochromatic' | 'd65' | 'blackbody' | 'uniform';
  spectrumParam: number;
  power: number;
  id?: number;
}

export interface IPackedSceneBuffers {
  segmentBuffer: ArrayBuffer;
  arcBuffer: ArrayBuffer;
  blackHoleBuffer: ArrayBuffer;
  emitterBuffer: ArrayBuffer;
  uniformBuffer: ArrayBuffer;
}

export function encodeBVHNode(
  floatView: Float32Array,
  uintView: Uint32Array,
  index: number,
  node: IGpuBVHNode
): void {
  const offset = (index * BVH_NODE_STRIDE_BYTES) / 4;
  floatView[offset + 0] = node.aabbMin.x;
  floatView[offset + 1] = node.aabbMin.y;
  floatView[offset + 2] = node.aabbMax.x;
  floatView[offset + 3] = node.aabbMax.y;
  uintView[offset + 4] = node.leftChild >>> 0;
  uintView[offset + 5] = node.rightChildOrCount >>> 0;
  uintView[offset + 6] = node.primType >>> 0;
  uintView[offset + 7] = node.primIndex >>> 0;
}

export function encodeSegment(
  floatView: Float32Array,
  _uintView: Uint32Array,
  index: number,
  seg: IGpuSegment
): void {
  const offset = (index * SEGMENT_STRIDE_BYTES) / 4;
  floatView[offset + 0] = seg.p1.x;
  floatView[offset + 1] = seg.p1.y;
  floatView[offset + 2] = seg.p2.x;
  floatView[offset + 3] = seg.p2.y;

  // Compact optical encoding: n1 <= -0.5 -> Mirror, n1 == 0.0 -> Barrier, n1 > 0 -> Dielectric n1
  let n1Val = seg.n1;
  if (seg.isBarrier) n1Val = 0.0;
  else if (seg.isMirror) n1Val = -1.0;

  floatView[offset + 4] = n1Val;
  floatView[offset + 5] = seg.n2;
  floatView[offset + 6] = seg.cauchyA;
  floatView[offset + 7] = seg.cauchyB;
}

export function encodeArc(
  floatView: Float32Array,
  _uintView: Uint32Array,
  index: number,
  arc: IGpuArc
): void {
  const offset = (index * ARC_STRIDE_BYTES) / 4;
  floatView[offset + 0] = arc.center.x;
  floatView[offset + 1] = arc.center.y;
  floatView[offset + 2] = arc.radius;
  floatView[offset + 3] = arc.nGlass;
  floatView[offset + 4] = arc.startAngle;
  floatView[offset + 5] = arc.endAngle;
  floatView[offset + 6] = arc.cauchyA;
  floatView[offset + 7] = arc.cauchyB;
}

export function encodeBlackHole(
  floatView: Float32Array,
  _uintView: Uint32Array,
  index: number,
  bh: IGpuBlackHole
): void {
  const offset = (index * BLACK_HOLE_STRIDE_BYTES) / 4;
  floatView[offset + 0] = bh.center.x;
  floatView[offset + 1] = bh.center.y;
  floatView[offset + 2] = bh.rs;
  floatView[offset + 3] = bh.rInfluence;
}

export function encodeEmitter(
  floatView: Float32Array,
  _uintView: Uint32Array,
  index: number,
  em: IGpuEmitter
): void {
  const offset = (index * EMITTER_STRIDE_BYTES) / 4;
  floatView[offset + 0] = em.pos.x;
  floatView[offset + 1] = em.pos.y;
  floatView[offset + 2] = em.dir.x;
  floatView[offset + 3] = em.dir.y;
  floatView[offset + 4] = em.width;

  let specType = 0;
  if (em.spectrumType === 'd65') specType = 1;
  else if (em.spectrumType === 'blackbody') specType = 2;
  else if (em.spectrumType === 'uniform') specType = 3;

  floatView[offset + 5] = specType;
  floatView[offset + 6] = em.spectrumParam;
  floatView[offset + 7] = em.power;
}

export function packSceneBuffers(
  scene: IOfflineSceneGeometry,
  batchPhotons: number,
  maxBounces = 32,
  seed = Date.now()
): IPackedSceneBuffers {
  // 1. Extract and serialize segments (Barriers + Prisms + Lens segments)
  const segments: IGpuSegment[] = [];

  for (let i = 0; i < scene.barriers.length; i++) {
    const b = scene.barriers[i];
    segments.push({
      p1: b.p1,
      p2: b.p2,
      n1: 1.0,
      n2: 1.0,
      cauchyA: 1.0,
      cauchyB: 0,
      isBarrier: !b.isMirror,
      isMirror: !!b.isMirror,
      id: b.id
    });
  }

  for (let i = 0; i < scene.prisms.length; i++) {
    const p = scene.prisms[i];
    const nGlass = p.glass ? evaluateSellmeierIndex(p.glass, 587.6) : (p.n ?? 1.5);
    const cauchyA = p.cauchyA ?? nGlass;
    const cauchyB = p.cauchyB ?? 4200;
    const n = p.vertices.length;

    for (let j = 0; j < n; j++) {
      const v1 = p.vertices[j];
      const v2 = p.vertices[(j + 1) % n];
      segments.push({
        p1: v1,
        p2: v2,
        n1: 1.0,
        n2: nGlass,
        cauchyA,
        cauchyB,
        id: p.id
      });
    }
  }

  for (let i = 0; i < scene.lenses.length; i++) {
    const l = scene.lenses[i];
    if (l.segments) {
      for (let j = 0; j < l.segments.length; j++) {
        const seg = l.segments[j];
        segments.push({
          p1: seg.p1,
          p2: seg.p2,
          n1: seg.n1,
          n2: seg.n2,
          cauchyA: seg.cauchyA ?? 1.5,
          cauchyB: seg.cauchyB ?? 4200,
          id: seg.id
        });
      }
    }
  }

  const segCount = Math.max(1, segments.length);
  const segmentBuffer = new ArrayBuffer(segCount * SEGMENT_STRIDE_BYTES);
  const segFloats = new Float32Array(segmentBuffer);
  const segUints = new Uint32Array(segmentBuffer);
  for (let i = 0; i < segments.length; i++) {
    encodeSegment(segFloats, segUints, i, segments[i]);
  }

  // 2. Extract and serialize arcs (Lenses)
  const arcs: IGpuArc[] = [];
  for (let i = 0; i < scene.lenses.length; i++) {
    const l = scene.lenses[i];
    const nGlass = l.glass ? evaluateSellmeierIndex(l.glass, 587.6) : (l.n ?? 1.5);
    const cauchyA = l.cauchyA ?? nGlass;
    const cauchyB = l.cauchyB ?? 4200;

    for (let j = 0; j < l.arcs.length; j++) {
      const a = l.arcs[j];
      arcs.push({
        center: a.center,
        radius: a.radius,
        nGlass: a.nGlass ?? nGlass,
        startAngle: a.startAngle,
        endAngle: a.endAngle,
        cauchyA: a.cauchyA ?? cauchyA,
        cauchyB: a.cauchyB ?? cauchyB,
        id: l.id
      });
    }
  }

  const arcCount = Math.max(1, arcs.length);
  const arcBuffer = new ArrayBuffer(arcCount * ARC_STRIDE_BYTES);
  const arcFloats = new Float32Array(arcBuffer);
  const arcUints = new Uint32Array(arcBuffer);
  for (let i = 0; i < arcs.length; i++) {
    encodeArc(arcFloats, arcUints, i, arcs[i]);
  }

  // 3. Extract and serialize black holes
  const bhCount = Math.max(1, scene.blackHoles.length);
  const blackHoleBuffer = new ArrayBuffer(bhCount * BLACK_HOLE_STRIDE_BYTES);
  const bhFloats = new Float32Array(blackHoleBuffer);
  const bhUints = new Uint32Array(blackHoleBuffer);
  for (let i = 0; i < scene.blackHoles.length; i++) {
    const bh = scene.blackHoles[i];
    encodeBlackHole(bhFloats, bhUints, i, {
      center: bh.center,
      rs: bh.rs,
      rInfluence: bh.rInfluence,
      id: bh.id
    });
  }

  // 4. Extract and serialize emitters
  const emitterCount = Math.max(1, scene.emitters.length);
  const emitterBuffer = new ArrayBuffer(emitterCount * EMITTER_STRIDE_BYTES);
  const emFloats = new Float32Array(emitterBuffer);
  const emUints = new Uint32Array(emitterBuffer);
  for (let i = 0; i < scene.emitters.length; i++) {
    const em = scene.emitters[i];
    encodeEmitter(emFloats, emUints, i, {
      pos: em.pos,
      dir: em.dir,
      width: em.width,
      spectrumType: em.spectrumType,
      spectrumParam: em.spectrumParam,
      power: em.power,
      id: em.id
    });
  }

  // 5. Uniform Scene Config Buffer
  const uniformBuffer = new ArrayBuffer(UNIFORM_CONFIG_STRIDE_BYTES);
  const uFloats = new Float32Array(uniformBuffer);
  const uUints = new Uint32Array(uniformBuffer);

  uFloats[0] = scene.bounds.minX;
  uFloats[1] = scene.bounds.minY;
  uFloats[2] = scene.bounds.maxX;
  uFloats[3] = scene.bounds.maxY;

  uUints[4] = 0; // numBVH
  uUints[5] = segments.length;
  uUints[6] = arcs.length;
  uUints[7] = scene.blackHoles.length;

  uFloats[8] = seed;
  uFloats[9] = maxBounces;
  uFloats[10] = 0.1; // russianRouletteThreshold
  uFloats[11] = 0; // padding

  uFloats[12] = scene.bounds.maxX - scene.bounds.minX;
  uFloats[13] = scene.bounds.maxY - scene.bounds.minY;
  uUints[14] = batchPhotons;
  uUints[15] = scene.emitters.length;

  return {
    segmentBuffer,
    arcBuffer,
    blackHoleBuffer,
    emitterBuffer,
    uniformBuffer
  };
}
