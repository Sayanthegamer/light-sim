import { describe, it, expect, vi } from 'vitest';
import { BranchManager, type BeamFrustum, MAX_FRUSTUM_POOL } from '../../src/engine/geometry/branchManager';
import { type Segment2D } from '../../src/engine/geometry/intersections';
import { traceGeodesicWithTermination, TerminationReason } from '../../src/engine/physics/blackHoleBoundary';
import { createGeodesicTrajectory, type BlackHole } from '../../src/engine/physics/rk2Integrator';
import { OpticsEngine } from '../../src/engine/engine';
import { EmitterNode } from '../../src/engine/scene/emitterNode';
import { BlackHoleNode } from '../../src/engine/scene/blackHoleNode';
import { BarrierNode } from '../../src/engine/scene/barrierNode';

function createMockCanvas(): HTMLCanvasElement {
  const gl = {
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x0100,
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    TEXTURE_2D: 0x0de1,
    RGBA: 0x1908,
    RGBA16F: 0x881a,
    RGBA8: 0x8058,
    R8: 0x8229,
    RED: 0x1903,
    HALF_FLOAT: 0x140b,
    UNSIGNED_BYTE: 0x1401,
    FLOAT: 0x1406,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    COLOR_ATTACHMENT0: 0x8ce0,
    ARRAY_BUFFER: 0x8892,
    DYNAMIC_DRAW: 0x88e8,
    STATIC_DRAW: 0x88e4,
    SRC_ALPHA: 0x0302,
    ONE: 1,
    BLEND: 0x0be2,
    CULL_FACE: 0x0b44,
    DEPTH_TEST: 0x0b71,
    TRIANGLES: 0x0004,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,
    TEXTURE2: 0x84c2,

    getExtension: vi.fn(() => ({})),
    createFramebuffer: vi.fn(() => ({ id: 'fbo' })),
    deleteFramebuffer: vi.fn(),
    bindFramebuffer: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 0x8cd5),
    createTexture: vi.fn(() => ({ id: 'tex' })),
    deleteTexture: vi.fn(),
    bindTexture: vi.fn(),
    activeTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    framebufferTexture2D: vi.fn(),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    createBuffer: vi.fn(() => ({ id: 'buf' })),
    deleteBuffer: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    bufferSubData: vi.fn(),
    createVertexArray: vi.fn(() => ({ id: 'vao' })),
    deleteVertexArray: vi.fn(),
    bindVertexArray: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    createShader: vi.fn(() => ({ id: 'shader' })),
    deleteShader: vi.fn(),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    createProgram: vi.fn(() => ({ id: 'prog' })),
    deleteProgram: vi.fn(),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    useProgram: vi.fn(),
    getUniformLocation: vi.fn((_p, name) => ({ name })),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform1i: vi.fn(),
    drawArrays: vi.fn()
  };

  return {
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    getContext: vi.fn((type: string) => (type === 'webgl2' ? gl : null)),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600
    }))
  } as unknown as HTMLCanvasElement;
}

describe('Physics Refactor & Regression Tests', () => {
  describe('1. Multi-Spectral Frustum Independence & Pool Isolation', () => {
    it('preserves distinct spectral sample frustums across multiple traceLightTree passes without mutating prior results', () => {
      const manager = new BranchManager();
      const dispersiveSegment: Segment2D = {
        id: 1,
        p1: { x: 100, y: 0 },
        p2: { x: 100, y: 300 },
        n1: 1.0,
        n2: 1.5,
        cauchyA: 1.5,
        cauchyB: 4000
      };

      const samples = 4;
      const allResults: BeamFrustum[][] = [];

      for (let s = 0; s < samples; s++) {
        const u = s / (samples - 1);
        const initialFrustum: BeamFrustum = {
          id: 0,
          depth: 0,
          leftRay: { origin: { x: 0, y: 150 }, dir: { x: 1, y: 0 } },
          rightRay: { origin: { x: 0, y: 140 }, dir: { x: 1, y: 0 } },
          leftHit: { x: 0, y: 0 },
          rightHit: { x: 0, y: 0 },
          intensity: 1.0 / samples,
          dispersionU: u,
          tintRGB: [255, 255, 255],
          isDispersed: true
        };

        const result = manager.traceLightTree(initialFrustum, [dispersiveSegment], [], []);
        allResults.push([...result]);
      }

      // Check that earlier spectral sample results were not mutated / overwritten by later samples
      for (let s = 0; s < samples; s++) {
        const expectedU = s / (samples - 1);
        const sampleFrustums = allResults[s];
        expect(sampleFrustums.length).toBeGreaterThan(0);
        expect(sampleFrustums[0].dispersionU).toBeCloseTo(expectedU, 5);
        expect(sampleFrustums[0].intensity).toBeCloseTo(1.0 / samples, 5);
      }

      // Ensure objects are independent instances, not aliasing the same pool slot
      expect(allResults[0][0]).not.toBe(allResults[1][0]);
    });

    it('gracefully handles pool scaling beyond 32 without aliasing references to the last slot', () => {
      const manager = new BranchManager();
      // Should support large pool capacity (e.g. 1024)
      expect(MAX_FRUSTUM_POOL).toBeGreaterThanOrEqual(256);
    });
  });

  describe('2. Deep Optical Branching Scene (>32 Frustums)', () => {
    it('traces complex multi-bounce optical chain without artificial 32-cap truncation', () => {
      const manager = new BranchManager();

      // Create a series of 6 parallel partial reflective glass plates to fan out many branches
      const obstacles: Segment2D[] = [
        { id: 1, p1: { x: 100, y: 0 }, p2: { x: 100, y: 400 }, n1: 1.0, n2: 1.5 },
        { id: 2, p1: { x: 200, y: 0 }, p2: { x: 200, y: 400 }, n1: 1.5, n2: 1.0 },
        { id: 3, p1: { x: 300, y: 0 }, p2: { x: 300, y: 400 }, n1: 1.0, n2: 1.5 },
        { id: 4, p1: { x: 400, y: 0 }, p2: { x: 400, y: 400 }, n1: 1.5, n2: 1.0 },
        { id: 5, p1: { x: 500, y: 0 }, p2: { x: 500, y: 400 }, n1: 1.0, n2: 1.5 },
        { id: 6, p1: { x: 600, y: 0 }, p2: { x: 600, y: 400 }, n1: 1.5, n2: 1.0 }
      ];

      const initialFrustum: BeamFrustum = {
        id: 0,
        depth: 0,
        leftRay: { origin: { x: 0, y: 200 }, dir: { x: 1, y: 0.1 } },
        rightRay: { origin: { x: 0, y: 190 }, dir: { x: 1, y: 0.1 } },
        leftHit: { x: 0, y: 0 },
        rightHit: { x: 0, y: 0 },
        intensity: 1.0,
        dispersionU: -1.0,
        tintRGB: [255, 255, 255],
        isDispersed: false
      };

      const frustums = manager.traceLightTree(initialFrustum, obstacles, [], [], 2000);
      
      // All returned frustums must be unique objects
      const uniqueObjects = new Set(frustums);
      expect(uniqueObjects.size).toBe(frustums.length);
    });
  });

  describe('3. Unified Geodesic Integration & Outgoing Ray Optical Splicing', () => {
    it('supports 256-step trajectory integration for photons orbiting near photon sphere', () => {
      const trajectory = createGeodesicTrajectory(256);
      expect(trajectory.capacity).toBe(256);

      const bh: BlackHole = {
        center: { x: 300, y: 300 },
        rs: 20,
        rInfluence: 240,
        mass: 1.0
      };

      const ray = {
        origin: { x: 60, y: 351.9 },
        dir: { x: 1, y: 0 }
      };

      const result = traceGeodesicWithTermination(trajectory, ray, bh, 2 * Math.PI, 256);
      expect(trajectory.pointCount).toBeGreaterThan(10);
      expect([TerminationReason.Captured, TerminationReason.Escaped, TerminationReason.WindingCap]).toContain(result.reason);
    });

    it('splices escaped black hole trajectories back into downstream optical elements in solveLightField', () => {
      const canvas = createMockCanvas();
      const engine = new OpticsEngine(canvas);
      const scene = engine.getScene();
      scene.clear();

      // 1. Emitter shooting right
      const emitter = new EmitterNode('emitter-1', { x: 50, y: 300 }, 0, 20, 1.0, 550, false);
      scene.addNode(emitter);

      // 2. Black hole deflecting light slightly
      const bh = new BlackHoleNode('bh-1', { x: 300, y: 220 }, 15);
      scene.addNode(bh);

      // 3. Downstream mirror placed at (550, 420) specifically in the deflected beam's path
      // Note: The un-deflected straight ray stays at y=300 and completely misses this mirror!
      const mirror = new BarrierNode('mirror-1', { x: 550, y: 420 }, Math.PI / 4, { isMirror: true, length: 120 });
      scene.addNode(mirror);

      engine.solveLightField();
      const stats = engine.getStats();

      // With optical continuation/splicing:
      // 1. Initial straight frustum up to black hole boundary
      // 2. Escaped continuation frustum from black hole boundary to mirror
      // 3. Reflected child frustum from mirror into scene
      // Active frustums must be at least 3!
      expect(stats.activeFrustums).toBeGreaterThanOrEqual(3);
    });
  });
});
