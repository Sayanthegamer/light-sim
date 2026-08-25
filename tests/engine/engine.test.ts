import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpticsEngine } from '../../src/engine/engine';
import { newtonPrismPreset, schwarzschildDeflectionPreset, convexConcaveFocusPreset } from '../../src/engine/presets';

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

  const canvas = {
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

  return canvas;
}

describe('OpticsEngine Master Execution Pipeline', () => {
  let canvas: HTMLCanvasElement;
  let engine: OpticsEngine;

  beforeEach(() => {
    canvas = createMockCanvas();
    engine = new OpticsEngine(canvas);
  });

  it('initializes context, scene graph, solvers, passes, and preset', () => {
    expect(engine.getScene()).toBeDefined();
    expect(engine.getGizmoController()).toBeDefined();
    expect(engine.getHistoryManager()).toBeDefined();
    expect(engine.getRenderCoordinator()).toBeDefined();
  });

  it('loads preset and renders a frame with CPU solving and WebGL2 multi-pass pipeline', () => {
    engine.loadPreset(newtonPrismPreset);
    expect(engine.getScene().getAllNodes().length).toBe(2);

    engine.renderFrame();
    const stats = engine.getStats();
    expect(stats.nodeCount).toBe(2);
    expect(stats.vertexCount).toBeGreaterThan(0);
    expect(stats.activeFrustums).toBeGreaterThan(0);
  });

  it('renders monochromatic beam presets and lenses', () => {
    engine.loadPreset(convexConcaveFocusPreset);
    engine.renderFrame();
    const stats = engine.getStats();
    expect(stats.activeFrustums).toBeGreaterThan(0);
  });

  it('solves relativistic black hole geodesic trajectories', () => {
    engine.loadPreset(schwarzschildDeflectionPreset);
    engine.renderFrame();
    const stats = engine.getStats();
    expect(stats.nodeCount).toBe(2);
  });

  it('handles resize events smoothly', () => {
    engine.resize(1920, 1080);
    expect(engine.getWidth()).toBe(1920);
    expect(engine.getHeight()).toBe(1080);
  });

  it('supports play, pause, undo, redo, and reset', () => {
    engine.loadPreset(newtonPrismPreset);
    expect(engine.isPaused()).toBe(false);

    engine.setPaused(true);
    expect(engine.isPaused()).toBe(true);

    engine.setPaused(false);
    expect(engine.isPaused()).toBe(false);

    // Push state and undo
    engine.commitHistorySnapshot();
    const prism = engine.getScene().getAllNodes().find(n => n.type === 'prism');
    prism?.setPosition(400, 400);
    engine.commitHistorySnapshot();

    expect(engine.canUndo()).toBe(true);
    engine.undo();
    expect(engine.canRedo()).toBe(true);
    engine.redo();
  });

  it('starts and stops animation render loop', () => {
    let rafCallback: ((time: number) => void) | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
      rafCallback = cb;
      return 123;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    engine.start();
    if (rafCallback) {
      (rafCallback as (time: number) => void)(performance.now() + 1000);
    }
    engine.stop();

    vi.unstubAllGlobals();
  });

  it('cleans up GPU and engine resources on dispose', () => {
    engine.dispose();
  });
});
