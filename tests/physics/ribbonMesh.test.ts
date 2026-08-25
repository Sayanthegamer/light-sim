import { describe, it, expect, beforeEach } from 'vitest';
import {
  type GeodesicTrajectory,
  createGeodesicTrajectory
} from '../../src/engine/physics/rk2Integrator';
import {
  generateRibbonMesh,
  calculateLocalBeamWidth,
  calculateCausticIntensity,
  DEFAULT_EPSILON_PINCH
} from '../../src/engine/physics/ribbonMesh';
import { VboPacker } from '../../src/engine/geometry/vboPacker';

describe('Double-Sided Quad Ribbon Mesh & Caustic Concentration Engine', () => {
  let leftTrajectory: GeodesicTrajectory;
  let rightTrajectory: GeodesicTrajectory;
  let packer: VboPacker;

  beforeEach(() => {
    leftTrajectory = createGeodesicTrajectory(64);
    rightTrajectory = createGeodesicTrajectory(64);
    packer = new VboPacker(1024);
  });

  it('verifies default caustic pinch epsilon is 0.5 px', () => {
    expect(DEFAULT_EPSILON_PINCH).toBe(0.5);
  });

  it('computes local beam width between paired trajectory anchor points', () => {
    const l = { x: 100, y: 110 };
    const r = { x: 100, y: 90 };
    const width = calculateLocalBeamWidth(l.x, l.y, r.x, r.y);
    expect(width).toBeCloseTo(20, 5);
  });

  it('evaluates inverse-width caustic intensity scaling with epsilon clamping', () => {
    const w0 = 20.0; // initial aperture width = 20 px
    const baseIntensity = 1.0;

    // Normal width = 20 px -> intensity = 1.0
    expect(calculateCausticIntensity(baseIntensity, w0, 20.0, 0.5)).toBeCloseTo(1.0, 3);

    // Narrowed width = 2 px -> intensity = 10.0 (10x focus)
    expect(calculateCausticIntensity(baseIntensity, w0, 2.0, 0.5)).toBeCloseTo(10.0, 3);

    // Pinched caustic crossing point (width -> 0 px) -> clamped to epsilon = 0.5 px -> intensity = 40.0
    expect(calculateCausticIntensity(baseIntensity, w0, 0.0, 0.5)).toBeCloseTo(40.0, 3);
  });

  it('generates contiguous quad strips into VBO packer without allocating memory', () => {
    // Populate 4 synthetic time steps
    leftTrajectory.pointCount = 4;
    rightTrajectory.pointCount = 4;

    for (let i = 0; i < 4; i++) {
      leftTrajectory.pointsX[i] = 100 + i * 50;
      leftTrajectory.pointsY[i] = 200 + i * 10;
      rightTrajectory.pointsX[i] = 100 + i * 50;
      rightTrajectory.pointsY[i] = 180 - i * 10;
    }

    const quadCount = generateRibbonMesh(
      packer,
      leftTrajectory,
      rightTrajectory,
      1.0,
      0.5,
      [255, 255, 255]
    );

    // 4 points -> 3 quads -> 3 * 2 = 6 triangles = 18 vertices
    expect(quadCount).toBe(3);
    expect(packer.getVertexCount()).toBe(18);
    expect(packer.getByteLength()).toBe(18 * 24);

    const f32 = packer.getFloat32View();
    // Vertex 0 position: (100, 200)
    expect(f32[0]).toBeCloseTo(100, 3);
    expect(f32[1]).toBeCloseTo(200, 3);
  });

  it('handles crossed rays (inverted caustic ribbons) seamlessly', () => {
    // 3 steps: step 0 wide, step 1 pinched/crossed (w=0), step 2 inverted
    leftTrajectory.pointCount = 3;
    rightTrajectory.pointCount = 3;

    // Step 0: L=(100, 210), R=(100, 190) -> w = 20
    leftTrajectory.pointsX[0] = 100; leftTrajectory.pointsY[0] = 210;
    rightTrajectory.pointsX[0] = 100; rightTrajectory.pointsY[0] = 190;

    // Step 1: L=(200, 200), R=(200, 200) -> w = 0 (caustic focal point)
    leftTrajectory.pointsX[1] = 200; leftTrajectory.pointsY[1] = 200;
    rightTrajectory.pointsX[1] = 200; rightTrajectory.pointsY[1] = 200;

    // Step 2: L=(300, 190), R=(300, 210) -> w = 20 (inverted orientation)
    leftTrajectory.pointsX[2] = 300; leftTrajectory.pointsY[2] = 190;
    rightTrajectory.pointsX[2] = 300; rightTrajectory.pointsY[2] = 210;

    const quads = generateRibbonMesh(
      packer,
      leftTrajectory,
      rightTrajectory,
      1.0,
      0.0,
      [255, 255, 255]
    );

    expect(quads).toBe(2);
    expect(packer.getVertexCount()).toBe(12);

    const f32 = packer.getFloat32View();
    // Intensity at focal crossing point should reach 40x caustic peak (w0=20 / eps=0.5)
    // In Tri 1 of step 0 (L0, R0, L1), L1 is at vertex index 2 (offset 2 * 6 + 2 = 14)
    expect(f32[14]).toBeCloseTo(40.0, 2);
  });

  it('modulates vertex dispersion coordinate and intensity when blackHole is provided', () => {
    leftTrajectory.pointCount = 2;
    rightTrajectory.pointCount = 2;

    // Step 0: far from black hole (r = 4000)
    leftTrajectory.pointsX[0] = 4000; leftTrajectory.pointsY[0] = 500; leftTrajectory.radii[0] = 4000;
    rightTrajectory.pointsX[0] = 4000; rightTrajectory.pointsY[0] = 480; rightTrajectory.radii[0] = 4000;

    // Step 1: deep in gravity well near horizon (r = 42, rs = 40)
    leftTrajectory.pointsX[1] = 42; leftTrajectory.pointsY[1] = 0; leftTrajectory.radii[1] = 42;
    rightTrajectory.pointsX[1] = 42; rightTrajectory.pointsY[1] = 20; rightTrajectory.radii[1] = 42;

    const blackHole = {
      id: 1,
      center: { x: 0, y: 0 },
      rs: 40,
      rInfluence: 480
    };

    const quads = generateRibbonMesh(
      packer,
      leftTrajectory,
      rightTrajectory,
      1.0,
      0.5, // 580 nm (yellow/green)
      [255, 255, 255],
      0.5,
      blackHole,
      500 // baseLambda = 500 nm (cyan/green)
    );

    expect(quads).toBe(1);
    expect(packer.getVertexCount()).toBe(6);

    const f32 = packer.getFloat32View();
    // Far-field vertex (step 0): unshifted intensity ~ 1.0
    expect(f32[2]).toBeCloseTo(1.0, 1);

    // Deep potential well vertex (step 1, L1 is at vertex index 2):
    // Dilation at r=42, rs=40 is ~ 1/sqrt(1 - 40/42) = sqrt(21) ≈ 4.58 -> shifted wl > 2000 nm -> extinguished intensity ~ 0
    expect(f32[14]).toBeLessThan(0.01);
  });
});
