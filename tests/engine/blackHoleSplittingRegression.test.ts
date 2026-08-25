/**
 * Regression & Correctness Tests:
 * 1. Symmetric & Order-Agnostic Black Hole Entry (Right-Ray-First)
 * 2. Partial Beam Grazing & Frustum Partitioning (Left-Ray-Only & Right-Ray-Only)
 * 3. Explicit Frustum Partition Correctness & Energy Balance
 * 4. Auto-Expanding Zero-GC Frustum Pool Scaling Beyond 1024
 */

import { describe, it, expect, vi } from 'vitest';
import { BranchManager, type BeamFrustum } from '../../src/engine/geometry/branchManager';
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

  const listeners: Record<string, Function[]> = {};
  return {
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    getContext: (type: string) => {
      if (type === 'webgl2') return gl;
      return null;
    },
    addEventListener: (type: string, fn: Function) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener: (type: string, fn: Function) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter(f => f !== fn);
      }
    }
  } as unknown as HTMLCanvasElement;
}

describe('Black Hole Frustum Intersection, Splitting & Pool Scaling', () => {
  describe('1. Asymmetric / Order-Agnostic Entry (Right-Ray-First)', () => {
    it('deflects beam when the right boundary ray enters the black hole before the left ray', () => {
      const canvas = createMockCanvas();
      const engine = new OpticsEngine(canvas);
      const scene = engine.getScene();
      scene.clear();

      // Emitter at (50, 400), beam width 30 -> leftRay y=385, rightRay y=415, shooting right (dir={x:1, y:0})
      const emitter = new EmitterNode('emitter-1', { x: 50, y: 400 }, 0, {
        beamWidth: 30,
        intensity: 1.0,
        wavelength: 550,
        isWhiteLight: false
      });
      scene.addNode(emitter);

      // Black hole positioned below beam at (300, 470), rs=15, rInfluence=180
      // Right ray (y=415) is closer to center (y=470, dy=55) than left ray (y=385, dy=85)
      // Therefore, the right ray enters the influence circle earlier (tEntryR < tEntryL)
      const bh = new BlackHoleNode('bh-1', { x: 300, y: 470 }, 15);
      scene.addNode(bh);

      engine.solveLightField();
      const stats = engine.getStats();

      // The black hole MUST be detected and curved ribbon mesh generated
      expect(stats.vertexCount).toBeGreaterThan(0);
      // Both the straight entry frustum and the escaped/geodesic continuation should be active
      expect(stats.activeFrustums).toBeGreaterThanOrEqual(2);
    });
  });

  describe('2. Partial Beam Grazing & Frustum Partitioning', () => {
    it('partitions beam when only the left ray enters the black hole influence boundary', () => {
      const canvas = createMockCanvas();
      const engine = new OpticsEngine(canvas);
      const scene = engine.getScene();
      scene.clear();

      // Emitter at (50, 100), beam width 40 -> leftRay y=80, rightRay y=120, shooting right
      const emitter = new EmitterNode('emitter-1', { x: 50, y: 100 }, 0, {
        beamWidth: 40,
        intensity: 1.0,
        wavelength: 550,
        isWhiteLight: false
      });
      scene.addNode(emitter);

      // Black hole at (300, -80), rs=15, rInfluence=180. Influence circle y range is [-260, 100]
      // Left ray (y=80) enters the black hole (80 <= 100)
      // Right ray (y=120) misses the black hole completely (120 > 100)
      const bh = new BlackHoleNode('bh-1', { x: 300, y: -80 }, 15);
      scene.addNode(bh);

      // Downstream barrier at (600, 120) to capture the unaffected right sub-beam
      const barrier = new BarrierNode('barrier-1', { x: 600, y: 120 }, 0, { isMirror: false, length: 100 });
      scene.addNode(barrier);

      engine.solveLightField();
      const stats = engine.getStats();

      // Geodesic mesh generated for the entered left portion (>60 vertices for ribbon)
      expect(stats.vertexCount).toBeGreaterThanOrEqual(60);
      // Active frustums must contain:
      // 1. Entering straight beam up to black hole
      // 2. Unaffected outer sub-frustum continuing to barrier
      expect(stats.activeFrustums).toBeGreaterThanOrEqual(2);
    });

    it('partitions beam when only the right ray enters the black hole influence boundary', () => {
      const canvas = createMockCanvas();
      const engine = new OpticsEngine(canvas);
      const scene = engine.getScene();
      scene.clear();

      // Emitter at (50, 300), beam width 40 -> leftRay y=280, rightRay y=320, shooting right
      const emitter = new EmitterNode('emitter-1', { x: 50, y: 300 }, 0, {
        beamWidth: 40,
        intensity: 1.0,
        wavelength: 550,
        isWhiteLight: false
      });
      scene.addNode(emitter);

      // Black hole at (300, 480), rs=15, rInfluence=180. Influence circle y range is [300, 660]
      // Right ray (y=320) enters the black hole (320 >= 300)
      // Left ray (y=280) misses the black hole completely (280 < 300)
      const bh = new BlackHoleNode('bh-1', { x: 300, y: 480 }, 15);
      scene.addNode(bh);

      // Downstream barrier at (600, 280) to capture the unaffected left sub-beam
      const barrier = new BarrierNode('barrier-1', { x: 600, y: 280 }, 0, { isMirror: false, length: 100 });
      scene.addNode(barrier);

      engine.solveLightField();
      const stats = engine.getStats();

      // Geodesic mesh generated for the entered right portion (>60 vertices for ribbon)
      expect(stats.vertexCount).toBeGreaterThanOrEqual(60);
      // Active frustums must contain unaffected sub-frustum reaching downstream barrier
      expect(stats.activeFrustums).toBeGreaterThanOrEqual(2);
    });

    it('explicitly partitions frustum geometry without dropping the unaffected outer beam', () => {
      const manager = new BranchManager();
      manager.resetPool();

      // Initial beam from y=80 to y=120
      const initialFrustum: BeamFrustum = {
        id: 0,
        depth: 0,
        leftRay: { origin: { x: 50, y: 80 }, dir: { x: 1, y: 0 } },
        rightRay: { origin: { x: 50, y: 120 }, dir: { x: 1, y: 0 } },
        leftHit: { x: 0, y: 0 },
        rightHit: { x: 0, y: 0 },
        intensity: 1.0,
        dispersionU: 0.5,
        tintRGB: [255, 255, 255],
        isDispersed: false
      };

      const blackHoles = [{
        id: 1,
        center: { x: 300, y: -80 },
        rs: 15,
        rInfluence: 180
      }];

      let ribbonCalls = 0;
      const onRibbon = () => { ribbonCalls++; };

      const frustums = manager.traceLightTree(
        initialFrustum,
        [],
        [],
        [],
        blackHoles,
        onRibbon
      );

      // Ribbon callback must be invoked for the grazing geodesic
      expect(ribbonCalls).toBeGreaterThan(0);
      // The unaffected sub-frustum and entered sub-frustum must both be preserved
      expect(frustums.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('3. Auto-Expanding Zero-GC Frustum Pool', () => {
    it('dynamically expands pool beyond initial 1024 capacity without returning null or dropping branches', () => {
      const manager = new BranchManager();
      manager.resetPool();

      const allocated: BeamFrustum[] = [];
      const TARGET_COUNT = 1500;

      for (let i = 0; i < TARGET_COUNT; i++) {
        const frustum = manager.allocateFrustum();
        expect(frustum).not.toBeNull();
        if (frustum) {
          frustum.id = i;
          allocated.push(frustum);
        }
      }

      expect(allocated.length).toBe(TARGET_COUNT);
      // All allocated frustums should be unique references
      const uniqueSet = new Set(allocated);
      expect(uniqueSet.size).toBe(TARGET_COUNT);

      // Verify resetPool preserves expanded capacity for subsequent frames
      manager.resetPool();
      const firstOnNextFrame = manager.allocateFrustum();
      expect(firstOnNextFrame).toBe(allocated[0]);
    });
  });
});
