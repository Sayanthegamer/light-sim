import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebGLContextManager } from '../../src/engine/renderer/webglContext';
import { CompositePass, calculateExtendedReinhardLuminance } from '../../src/engine/renderer/compositePass';

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
    createShader: vi.fn(() => ({ id: 'shader' })),
    deleteShader: vi.fn(),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    createProgram: vi.fn(() => ({ id: 'composite_prog' })),
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

  return gl as unknown as WebGL2RenderingContext;
}

describe('CompositePass & Extended Reinhard Tonemapping', () => {
  let mockGl: WebGL2RenderingContext;
  let manager: WebGLContextManager;
  let compositePass: CompositePass;

  beforeEach(() => {
    mockGl = createMockWebGL2Context();
    manager = new WebGLContextManager(mockGl);
    compositePass = new CompositePass(manager);
  });

  it('evaluates Extended Reinhard luminance transform correctly in TypeScript', () => {
    // Luminance L = 0.2126 * 1.0 + 0.7152 * 1.0 + 0.0722 * 1.0 = 1.0
    // L_white = 4.0 -> L_white^2 = 16.0
    // Factor = (1 + 1.0 / 16.0) / (1 + 1.0) = (17/16) / 2 = 17 / 32 = 0.53125
    const out = calculateExtendedReinhardLuminance(1.0, 1.0, 1.0, 4.0);
    expect(out.r).toBeCloseTo(0.53125, 4);
    expect(out.g).toBeCloseTo(0.53125, 4);
    expect(out.b).toBeCloseTo(0.53125, 4);
  });

  it('maps high-intensity caustic focal points (I >> 1.0) asymptotically without blow-out', () => {
    // Extreme caustic: R=40, G=40, B=40
    // L = 40.0, L_white = 4.0 (L_white^2 = 16.0)
    // Factor = (1 + 40/16) / (1 + 40) = (1 + 2.5) / 41 = 3.5 / 41 ≈ 0.085365
    // Out RGB = 40 * 0.085365 ≈ 3.4146 (reaches near L_white before gamma compression)
    const out = calculateExtendedReinhardLuminance(40.0, 40.0, 40.0, 4.0);
    expect(out.r).toBeLessThanOrEqual(4.0);
    expect(out.r).toBeGreaterThan(1.0);
  });

  it('renders composite blit pass binding beam, scatter, and mask textures', () => {
    const beamFbo = manager.createHDRFramebuffer(800, 600);
    const scatterFbo = manager.createHDRFramebuffer(400, 300);
    const maskFbo = manager.createSingleChannelFramebuffer(800, 600);

    compositePass.render(null, beamFbo, scatterFbo, maskFbo, 800, 600, 1.0, 4.0, 1.0);

    expect(mockGl.useProgram).toHaveBeenCalled();
    expect(mockGl.viewport).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(mockGl.drawArrays).toHaveBeenCalledWith(mockGl.TRIANGLES, 0, 3);
  });
});
