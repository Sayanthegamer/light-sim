import { describe, it, expect } from 'vitest';
import {
  BVH_NODE_STRIDE_BYTES,
  SEGMENT_STRIDE_BYTES,
  ARC_STRIDE_BYTES,
  BLACK_HOLE_STRIDE_BYTES,
  EMITTER_STRIDE_BYTES,
  PHOTON_VERTEX_STRIDE_BYTES,
  UNIFORM_CONFIG_STRIDE_BYTES,
  encodeBVHNode,
  encodeSegment,
  encodeArc,
  encodeBlackHole,
  encodeEmitter,
  packSceneBuffers,
  type IGpuBVHNode,
  type IGpuSegment,
  type IGpuArc,
  type IGpuBlackHole,
  type IGpuEmitter
} from '../../src/engine/offline/gpu/gpuPrimitiveLayout';
import { type IOfflineSceneGeometry } from '../../src/engine/offline/mcPhotonTracer';

describe('GPU Primitive Binary Layout & Alignment', () => {
  it('enforces strict 16-byte multiple stride constraints across all struct layouts', () => {
    expect(BVH_NODE_STRIDE_BYTES % 16).toBe(0);
    expect(SEGMENT_STRIDE_BYTES % 16).toBe(0);
    expect(ARC_STRIDE_BYTES % 16).toBe(0);
    expect(BLACK_HOLE_STRIDE_BYTES % 16).toBe(0);
    expect(EMITTER_STRIDE_BYTES % 16).toBe(0);
    expect(PHOTON_VERTEX_STRIDE_BYTES % 16).toBe(0);
    expect(UNIFORM_CONFIG_STRIDE_BYTES % 16).toBe(0);

    expect(BVH_NODE_STRIDE_BYTES).toBe(32);
    expect(SEGMENT_STRIDE_BYTES).toBe(48);
    expect(ARC_STRIDE_BYTES).toBe(48);
    expect(BLACK_HOLE_STRIDE_BYTES).toBe(32);
    expect(EMITTER_STRIDE_BYTES).toBe(48);
    expect(PHOTON_VERTEX_STRIDE_BYTES).toBe(32);
    expect(UNIFORM_CONFIG_STRIDE_BYTES).toBe(64);
  });

  it('correctly serializes a BVH node into a binary buffer with exact field offsets', () => {
    const buffer = new ArrayBuffer(BVH_NODE_STRIDE_BYTES);
    const floatView = new Float32Array(buffer);
    const uintView = new Uint32Array(buffer);

    const node: IGpuBVHNode = {
      aabbMin: { x: -100, y: -50 },
      aabbMax: { x: 200, y: 150 },
      leftChild: 2,
      rightChildOrCount: 3,
      primType: 1, // Arc
      primIndex: 7
    };

    encodeBVHNode(floatView, uintView, 0, node);

    expect(floatView[0]).toBe(-100);
    expect(floatView[1]).toBe(-50);
    expect(floatView[2]).toBe(200);
    expect(floatView[3]).toBe(150);
    expect(uintView[4]).toBe(2);
    expect(uintView[5]).toBe(3);
    expect(uintView[6]).toBe(1);
    expect(uintView[7]).toBe(7);
  });

  it('correctly serializes a segment with refractive & dispersion parameters', () => {
    const buffer = new ArrayBuffer(SEGMENT_STRIDE_BYTES);
    const floatView = new Float32Array(buffer);
    const uintView = new Uint32Array(buffer);

    const seg: IGpuSegment = {
      p1: { x: 10, y: 20 },
      p2: { x: 50, y: 80 },
      n1: 1.0,
      n2: 1.517,
      cauchyA: 1.504,
      cauchyB: 4200,
      isMirror: false,
      isBarrier: false,
      id: 42
    };

    encodeSegment(floatView, uintView, 0, seg);

    expect(floatView[0]).toBe(10);
    expect(floatView[1]).toBe(20);
    expect(floatView[2]).toBe(50);
    expect(floatView[3]).toBe(80);
    expect(floatView[4]).toBe(1.0);
    expect(floatView[5]).toBeCloseTo(1.517);
    expect(floatView[6]).toBeCloseTo(1.504);
    expect(floatView[7]).toBe(4200);
    expect(uintView[8]).toBe(0); // flags: dielectric
    expect(uintView[9]).toBe(42);
  });

  it('correctly serializes a mirror and barrier with proper flag bitmasks', () => {
    const buffer = new ArrayBuffer(SEGMENT_STRIDE_BYTES * 2);
    const floatView = new Float32Array(buffer);
    const uintView = new Uint32Array(buffer);

    const mirror: IGpuSegment = {
      p1: { x: 0, y: 0 },
      p2: { x: 100, y: 0 },
      n1: 1.0,
      n2: 1.0,
      cauchyA: 1.0,
      cauchyB: 0,
      isMirror: true,
      isBarrier: false,
      id: 1
    };

    const barrier: IGpuSegment = {
      p1: { x: 0, y: 50 },
      p2: { x: 100, y: 50 },
      n1: 1.0,
      n2: 1.0,
      cauchyA: 1.0,
      cauchyB: 0,
      isMirror: false,
      isBarrier: true,
      id: 2
    };

    encodeSegment(floatView, uintView, 0, mirror);
    encodeSegment(floatView, uintView, 1, barrier);

    expect(uintView[8]).toBe(2); // Flag: Mirror = 2
    expect(uintView[9]).toBe(1);
    expect(uintView[8 + 12]).toBe(1); // Flag: Barrier = 1
    expect(uintView[9 + 12]).toBe(2);
  });

  it('correctly serializes an arc with circular bounds and Cauchy constants', () => {
    const buffer = new ArrayBuffer(ARC_STRIDE_BYTES);
    const floatView = new Float32Array(buffer);
    const uintView = new Uint32Array(buffer);

    const arc: IGpuArc = {
      center: { x: 300, y: 200 },
      radius: 75,
      nGlass: 1.62,
      startAngle: -1.57,
      endAngle: 1.57,
      cauchyA: 1.60,
      cauchyB: 5300,
      id: 10
    };

    encodeArc(floatView, uintView, 0, arc);

    expect(floatView[0]).toBe(300);
    expect(floatView[1]).toBe(200);
    expect(floatView[2]).toBe(75);
    expect(floatView[3]).toBeCloseTo(1.62);
    expect(floatView[4]).toBeCloseTo(-1.57);
    expect(floatView[5]).toBeCloseTo(1.57);
    expect(floatView[6]).toBeCloseTo(1.60);
    expect(floatView[7]).toBe(5300);
    expect(uintView[9]).toBe(10);
  });

  it('correctly serializes a black hole with center and Schwarzschild radius', () => {
    const buffer = new ArrayBuffer(BLACK_HOLE_STRIDE_BYTES);
    const floatView = new Float32Array(buffer);
    const uintView = new Uint32Array(buffer);

    const bh: IGpuBlackHole = {
      center: { x: 400, y: 300 },
      rs: 25,
      rInfluence: 300,
      id: 99
    };

    encodeBlackHole(floatView, uintView, 0, bh);

    expect(floatView[0]).toBe(400);
    expect(floatView[1]).toBe(300);
    expect(floatView[2]).toBe(25);
    expect(floatView[3]).toBe(300);
    expect(uintView[4]).toBe(99);
  });

  it('correctly serializes an emitter with spectral parameters', () => {
    const buffer = new ArrayBuffer(EMITTER_STRIDE_BYTES);
    const floatView = new Float32Array(buffer);
    const uintView = new Uint32Array(buffer);

    const emitter: IGpuEmitter = {
      pos: { x: 50, y: 150 },
      dir: { x: 1, y: 0 },
      width: 40,
      spectrumType: 'd65',
      spectrumParam: 6500,
      power: 1.5,
      id: 7
    };

    encodeEmitter(floatView, uintView, 0, emitter);

    expect(floatView[0]).toBe(50);
    expect(floatView[1]).toBe(150);
    expect(floatView[2]).toBe(1);
    expect(floatView[3]).toBe(0);
    expect(floatView[4]).toBe(40);
    expect(floatView[5]).toBe(1); // 1 = D65
    expect(floatView[6]).toBe(6500);
    expect(floatView[7]).toBe(1.5);
    expect(uintView[8]).toBe(7);
  });

  it('packs an entire scene geometry into segregated typed array buffers', () => {
    const scene: IOfflineSceneGeometry = {
      bounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 },
      emitters: [
        {
          id: 1,
          pos: { x: 50, y: 300 },
          dir: { x: 1, y: 0 },
          width: 20,
          spectrumType: 'monochromatic',
          spectrumParam: 550,
          power: 1.0
        }
      ],
      prisms: [
        {
          id: 2,
          vertices: [
            { x: 200, y: 200 },
            { x: 300, y: 350 },
            { x: 100, y: 350 }
          ],
          n: 1.5,
          cauchyA: 1.5,
          cauchyB: 4000
        }
      ],
      lenses: [
        {
          id: 3,
          arcs: [
            {
              center: { x: 500, y: 300 },
              radius: 60,
              startAngle: -1,
              endAngle: 1,
              nGlass: 1.55,
              cauchyA: 1.54,
              cauchyB: 4500
            }
          ]
        }
      ],
      barriers: [
        {
          id: 4,
          p1: { x: 700, y: 100 },
          p2: { x: 700, y: 500 },
          isMirror: true
        }
      ],
      blackHoles: [
        {
          id: 5,
          center: { x: 600, y: 300 },
          rs: 20,
          rInfluence: 240
        }
      ]
    };

    const packed = packSceneBuffers(scene, 1000, 32, 12345);

    expect(packed.segmentBuffer.byteLength).toBe(SEGMENT_STRIDE_BYTES * 4); // 3 prism edges + 1 barrier
    expect(packed.arcBuffer.byteLength).toBe(ARC_STRIDE_BYTES * 1);
    expect(packed.blackHoleBuffer.byteLength).toBe(BLACK_HOLE_STRIDE_BYTES * 1);
    expect(packed.emitterBuffer.byteLength).toBe(EMITTER_STRIDE_BYTES * 1);
    expect(packed.uniformBuffer.byteLength).toBe(UNIFORM_CONFIG_STRIDE_BYTES);

    const uniformFloats = new Float32Array(packed.uniformBuffer);
    const uniformUints = new Uint32Array(packed.uniformBuffer);

    expect(uniformFloats[0]).toBe(0);
    expect(uniformFloats[1]).toBe(0);
    expect(uniformFloats[2]).toBe(800);
    expect(uniformFloats[3]).toBe(600);

    expect(uniformUints[4]).toBe(0); // numBVH
    expect(uniformUints[5]).toBe(4); // numSegments
    expect(uniformUints[6]).toBe(1); // numArcs
    expect(uniformUints[7]).toBe(1); // numBlackHoles

    expect(uniformFloats[8]).toBe(12345); // Seed
    expect(uniformFloats[9]).toBe(32); // Max bounces
    expect(uniformUints[14]).toBe(1000); // batchPhotons
    expect(uniformUints[15]).toBe(1); // emitterCount
  });
});
