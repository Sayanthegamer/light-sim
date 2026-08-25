import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebGLContextManager } from '../../src/engine/renderer/webglContext';
import { ScatterPass } from '../../src/engine/renderer/scatterPass';

function createMockWebGL2Context(): WebGL2RenderingContext {
  const gl = {
    COLOR_BUFFER_BIT: 0x4000,
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    TEXTURE_2D: 0x0de1,
    RGBA: 0x1908,
    RGBA16F: 0x881a,
    RGBA8: 0x8058,
    HALF_FLOAT: 0x140b,
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
    createFramebuffer: vi.fn(() => ({ id: 'scatter_fbo' })),
    deleteFramebuffer: vi.fn(),
    bindFramebuffer: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 0x8cd5),
    createTexture: vi.fn(() => ({ id: 'scatter_tex' })),
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
    createShader: vi.fn(() => ({ id: 'scatter_shader' })),
    deleteShader: vi.fn(),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    createProgram: vi.fn(() => ({ id: 'scatter_prog' })),
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

describe('ScatterPass (Pass 3 Two-Tier Hybrid Scatter Filter)', () => {
  let mockGl: WebGL2RenderingContext;
  let manager: WebGLContextManager;
  let scatterPass: ScatterPass;

  beforeEach(() => {
    mockGl = createMockWebGL2Context();
    manager = new WebGLContextManager(mockGl);
    scatterPass = new ScatterPass(manager, 800, 600);
  });

  it('allocates hierarchical multi-resolution framebuffers (1/2, 1/4, 1/8)', () => {
    expect(scatterPass.getHalfWidth()).toBe(400);
    expect(scatterPass.getHalfHeight()).toBe(300);
    expect(scatterPass.getQuarterWidth()).toBe(200);
    expect(scatterPass.getQuarterHeight()).toBe(150);
    expect(scatterPass.getEighthWidth()).toBe(100);
    expect(scatterPass.getEighthHeight()).toBe(75);
  });

  it('executes Two-Tier Hybrid Scatter pass with bilateral blur and Dual Kawase bloom', () => {
    const lightFbo = manager.createHDRFramebuffer(800, 600);
    const maskFbo = manager.createSingleChannelFramebuffer(800, 600);

    const outputFbo = scatterPass.execute(lightFbo, maskFbo, 800, 600, 0.4);

    expect(outputFbo).toBeDefined();
    expect(outputFbo.width).toBe(400);
    expect(outputFbo.height).toBe(300);
    expect(mockGl.drawArrays).toHaveBeenCalled();
  });

  it('resizes hierarchical scatter framebuffers on viewport change', () => {
    scatterPass.resize(1920, 1080);

    expect(scatterPass.getHalfWidth()).toBe(960);
    expect(scatterPass.getHalfHeight()).toBe(540);
    expect(scatterPass.getQuarterWidth()).toBe(480);
    expect(scatterPass.getQuarterHeight()).toBe(270);
    expect(scatterPass.getEighthWidth()).toBe(240);
    expect(scatterPass.getEighthHeight()).toBe(135);
  });
});
