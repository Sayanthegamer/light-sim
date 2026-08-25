import { describe, it, expect, beforeEach } from 'vitest';
import {
  VboPacker,
  VERTEX_BYTE_STRIDE,
  generateQuadFrustumMesh,
  generateTriangularFanMesh
} from '../../src/engine/geometry/vboPacker';
import { type BeamFrustum } from '../../src/engine/geometry/branchManager';

describe('24-Byte Interleaved VBO Layout & Frustum Triangulation', () => {
  let packer: VboPacker;

  beforeEach(() => {
    packer = new VboPacker(1000); // 1000 vertices capacity
  });

  it('enforces 24-byte vertex stride layout', () => {
    expect(VERTEX_BYTE_STRIDE).toBe(24);
  });

  it('writes interleaved vertex attributes accurately with correct byte offsets', () => {
    packer.writeVertex(
      150.5,   // x
      250.25,  // y
      2.5,     // intensity (caustic focal scale)
      0.75,    // dispersionU
      1.0,     // edgeV (right boundary)
      255,     // r
      128,     // g
      64,      // b
      255      // a
    );

    expect(packer.getVertexCount()).toBe(1);
    expect(packer.getByteLength()).toBe(24);

    const f32 = packer.getFloat32View();
    const u8 = packer.getUint8View();

    // Offset 0 & 4: Position (x, y)
    expect(f32[0]).toBeCloseTo(150.5, 3);
    expect(f32[1]).toBeCloseTo(250.25, 3);

    // Offset 8: Intensity
    expect(f32[2]).toBeCloseTo(2.5, 3);

    // Offset 12: DispersionU
    expect(f32[3]).toBeCloseTo(0.75, 3);

    // Offset 16: EdgeV
    expect(f32[4]).toBeCloseTo(1.0, 3);

    // Offset 20: Tint RGB (byte offsets 20, 21, 22, 23)
    expect(u8[20]).toBe(255);
    expect(u8[21]).toBe(128);
    expect(u8[22]).toBe(64);
    expect(u8[23]).toBe(255);
  });

  it('generates 2-triangle quad frustum mesh with caustic intensity scaling', () => {
    const frustum: BeamFrustum = {
      id: 1,
      depth: 0,
      leftRay: { origin: { x: 0, y: 110 }, dir: { x: 1, y: 0 } },
      rightRay: { origin: { x: 0, y: 90 }, dir: { x: 1, y: 0 } },
      // Starts with width 20px, narrows to width 5px at focus (4x caustic concentration)
      leftHit: { x: 100, y: 102.5 },
      rightHit: { x: 100, y: 97.5 },
      intensity: 1.0,
      dispersionU: -1.0,
      tintRGB: [255, 255, 255],
      isDispersed: false
    };

    generateQuadFrustumMesh(packer, frustum);

    // 1 quad = 2 triangles = 6 vertices
    expect(packer.getVertexCount()).toBe(6);
    expect(packer.getByteLength()).toBe(6 * 24);

    const f32 = packer.getFloat32View();

    // Start intensity at vertex 0 (w0 = 20px -> intensity = 1.0)
    expect(f32[2]).toBeCloseTo(1.0, 2);

    // End intensity at vertex 2 (w1 = 5px -> intensity = 1.0 * (20 / 5) = 4.0)
    // Vertex 2 is at offset 2 * 6 floats = index 12, intensity is at index 14
    expect(f32[14]).toBeCloseTo(4.0, 2);
  });

  it('generates triangular fan mesh for continuous dispersion', () => {
    const apex = { x: 100, y: 100 };
    const fanPoints = [
      { x: 300, y: 50, u: 0.0 }, // Red
      { x: 300, y: 100, u: 0.5 }, // Green
      { x: 300, y: 150, u: 1.0 }  // Violet
    ];

    generateTriangularFanMesh(packer, apex, fanPoints, 1.0, [255, 255, 255]);

    // 2 fan segments = 2 triangles = 6 vertices
    expect(packer.getVertexCount()).toBe(6);
    expect(packer.getByteLength()).toBe(6 * 24);
  });

  it('resets buffer for next frame with zero allocations', () => {
    packer.writeVertex(0, 0, 1, 0, 0, 255, 255, 255, 255);
    expect(packer.getVertexCount()).toBe(1);

    packer.reset();
    expect(packer.getVertexCount()).toBe(0);
    expect(packer.getByteLength()).toBe(0);
  });
});
