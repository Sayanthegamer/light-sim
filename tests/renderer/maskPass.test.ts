import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebGLContextManager } from '../../src/engine/renderer/webglContext';
import { MaskPass } from '../../src/engine/renderer/maskPass';

function createMockWebGL2Context(): WebGL2RenderingContext {
  const gl = {
    COLOR_BUFFER_BIT: 0x4000,
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    TEXTURE_2D: 0x0de1,
    RGBA: 0x1908,
    RGBA8: 0x8058,
    R8: 0x8229,
    RED: 0x1903,
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
    BLEND: 0x0be2,
    CULL_FACE: 0x0b44,
    DEPTH_TEST: 0x0b71,
    TRIANGLES: 0x0004,
    TRIANGLE_FAN: 0x0006,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,

    getExtension: vi.fn(() => null),
    createFramebuffer: vi.fn(() => ({ id: 'mask_fbo' })),
    deleteFramebuffer: vi.fn(),
    bindFramebuffer: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 0x8cd5),
    createTexture: vi.fn(() => ({ id: 'mask_tex' })),
    deleteTexture: vi.fn(),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    framebufferTexture2D: vi.fn(),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    createBuffer: vi.fn(() => ({ id: 'mask_buf' })),
    deleteBuffer: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    bufferSubData: vi.fn(),
    createVertexArray: vi.fn(() => ({ id: 'mask_vao' })),
    deleteVertexArray: vi.fn(),
    bindVertexArray: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    createShader: vi.fn(() => ({ id: 'mask_shader' })),
    deleteShader: vi.fn(),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    createProgram: vi.fn(() => ({ id: 'mask_prog' })),
    deleteProgram: vi.fn(),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    useProgram: vi.fn(),
    getUniformLocation: vi.fn((_p, name) => ({ name })),
    getAttribLocation: vi.fn(() => 0),
    uniform2f: vi.fn(),
    drawArrays: vi.fn()
  };

  return gl as unknown as WebGL2RenderingContext;
}

describe('MaskPass (Pass 2 Obstacle Geometry Mask Rasterizer)', () => {
  let mockGl: WebGL2RenderingContext;
  let manager: WebGLContextManager;
  let maskPass: MaskPass;

  beforeEach(() => {
    mockGl = createMockWebGL2Context();
    manager = new WebGLContextManager(mockGl);
    maskPass = new MaskPass(manager);
  });

  it('allocates a dedicated single-channel R8 mask framebuffer', () => {
    const maskFbo = manager.createSingleChannelFramebuffer(800, 600);

    expect(maskFbo.width).toBe(800);
    expect(maskFbo.height).toBe(600);
    expect(mockGl.texImage2D).toHaveBeenCalledWith(
      mockGl.TEXTURE_2D,
      0,
      mockGl.R8,
      800,
      600,
      0,
      mockGl.RED,
      mockGl.UNSIGNED_BYTE,
      null
    );
  });

  it('configures mask render state: clears to 0 and disables alpha blending', () => {
    const maskFbo = manager.createSingleChannelFramebuffer(800, 600);
    maskPass.begin(maskFbo, 800, 600);

    expect(mockGl.bindFramebuffer).toHaveBeenCalledWith(mockGl.FRAMEBUFFER, maskFbo.framebuffer);
    expect(mockGl.viewport).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(mockGl.clearColor).toHaveBeenCalledWith(0.0, 0.0, 0.0, 0.0);
    expect(mockGl.clear).toHaveBeenCalledWith(mockGl.COLOR_BUFFER_BIT);
    expect(mockGl.disable).toHaveBeenCalledWith(mockGl.BLEND);
  });

  it('rasterizes polygon obstacles (e.g. prisms, barriers) into mask VBO', () => {
    const maskFbo = manager.createSingleChannelFramebuffer(800, 600);
    maskPass.begin(maskFbo, 800, 600);

    // Triangle prism polygon: 3 vertices
    const prism = [
      { x: 300, y: 200 },
      { x: 400, y: 400 },
      { x: 200, y: 400 }
    ];

    maskPass.renderPolygons([prism]);

    expect(mockGl.bufferData).toHaveBeenCalled();
    expect(mockGl.drawArrays).toHaveBeenCalledWith(mockGl.TRIANGLES, 0, 3);
  });

  it('rasterizes circular obstacles (e.g. circular lens bodies or event horizons)', () => {
    const maskFbo = manager.createSingleChannelFramebuffer(800, 600);
    maskPass.begin(maskFbo, 800, 600);

    maskPass.renderCircles([
      { center: { x: 500, y: 500 }, radius: 40 }
    ]);

    expect(mockGl.drawArrays).toHaveBeenCalled();
  });
});
