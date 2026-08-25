import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebGLContextManager } from '../../src/engine/renderer/webglContext';
import {
  TemporalAccumulator,
  MAX_ACCUMULATION_FRAMES
} from '../../src/engine/renderer/temporalAccumulator';
import { RenderCoordinator, RenderState } from '../../src/engine/renderer/renderLoop';

function createMockWebGL2Context(): WebGL2RenderingContext {
  const gl = {
    COLOR_BUFFER_BIT: 0x4000,
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
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    COLOR_ATTACHMENT0: 0x8ce0,
    TRIANGLES: 0x0004,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,

    getExtension: vi.fn(() => ({})),
    createFramebuffer: vi.fn(() => ({ id: 'acc_fbo' })),
    deleteFramebuffer: vi.fn(),
    bindFramebuffer: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 0x8cd5),
    createTexture: vi.fn(() => ({ id: 'acc_tex' })),
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
    createProgram: vi.fn(() => ({ id: 'acc_prog' })),
    deleteProgram: vi.fn(),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    useProgram: vi.fn(),
    getUniformLocation: vi.fn((_p, name) => ({ name })),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    drawArrays: vi.fn()
  };

  return gl as unknown as WebGL2RenderingContext;
}

describe('TemporalAccumulator (8-Frame Progressive EMA Accumulation)', () => {
  let mockGl: WebGL2RenderingContext;
  let manager: WebGLContextManager;
  let accumulator: TemporalAccumulator;

  beforeEach(() => {
    mockGl = createMockWebGL2Context();
    manager = new WebGLContextManager(mockGl);
    accumulator = new TemporalAccumulator(manager, 800, 600);
  });

  it('verifies maximum accumulation budget is 8 frames', () => {
    expect(MAX_ACCUMULATION_FRAMES).toBe(8);
  });

  it('progressively accumulates up to 8 frames using EMA weighting', () => {
    const currentFbo = manager.createHDRFramebuffer(800, 600);

    for (let i = 0; i < 8; i++) {
      const res = accumulator.accumulate(currentFbo, 800, 600);
      expect(res.frameCount).toBe(i + 1);
      if (i < 7) {
        expect(res.isComplete).toBe(false);
      } else {
        expect(res.isComplete).toBe(true);
      }
    }
  });

  it('resets accumulation counter when dirty event occurs', () => {
    const currentFbo = manager.createHDRFramebuffer(800, 600);
    accumulator.accumulate(currentFbo, 800, 600);
    accumulator.accumulate(currentFbo, 800, 600);
    expect(accumulator.getFrameCount()).toBe(2);

    accumulator.reset();
    expect(accumulator.getFrameCount()).toBe(0);
  });
});

describe('RenderCoordinator (Dirty-State Event Loop & Idle Sleep)', () => {
  let mockGl: WebGL2RenderingContext;
  let manager: WebGLContextManager;
  let coordinator: RenderCoordinator;

  beforeEach(() => {
    mockGl = createMockWebGL2Context();
    manager = new WebGLContextManager(mockGl);
    coordinator = new RenderCoordinator(manager, 800, 600);
  });

  it('initializes in INTERACTING state and transitions to SETTLING then SLEEPING', () => {
    const frameFbo = manager.createHDRFramebuffer(800, 600);
    expect(coordinator.getState()).toBe(RenderState.Interacting);

    // Simulate settling: frame ticks
    coordinator.setInteracting(false);
    expect(coordinator.getState()).toBe(RenderState.Settling);

    // Step through 8 settling frames
    for (let i = 0; i < 8; i++) {
      coordinator.tick(frameFbo);
    }

    expect(coordinator.getState()).toBe(RenderState.Sleeping);
    expect(coordinator.isSleeping()).toBe(true);
  });

  it('wakes up instantly from SLEEPING to INTERACTING on pointer interaction', () => {
    const frameFbo = manager.createHDRFramebuffer(800, 600);
    coordinator.setInteracting(false);
    for (let i = 0; i < 8; i++) {
      coordinator.tick(frameFbo);
    }
    expect(coordinator.isSleeping()).toBe(true);

    coordinator.markDirty(true); // User started dragging
    expect(coordinator.getState()).toBe(RenderState.Interacting);
    expect(coordinator.isSleeping()).toBe(false);
  });
});
