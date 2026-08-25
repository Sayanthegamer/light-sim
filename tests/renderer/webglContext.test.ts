import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WebGLContextManager
} from '../../src/engine/renderer/webglContext';
import { BeamPass } from '../../src/engine/renderer/beamPass';
import { VboPacker } from '../../src/engine/geometry/vboPacker';

// Mock WebGL2 Rendering Context
function createMockWebGL2Context(hasHalfFloatExt = true, fboStatusComplete = true): WebGL2RenderingContext {
  const gl = {
    // Constants
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x0100,
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    FRAMEBUFFER_INCOMPLETE_ATTACHMENT: 0x8cd6,
    TEXTURE_2D: 0x0de1,
    RGBA: 0x1908,
    RGBA16F: 0x881a,
    RGBA8: 0x8058,
    R8: 0x8229,
    RED: 0x1903,
    HALF_FLOAT: 0x140b,
    UNSIGNED_BYTE: 0x1401,
    FLOAT: 0x1406,
    NEAREST: 0x2600,
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

    // Methods
    getExtension: vi.fn((name: string) => {
      if (name === 'EXT_color_buffer_half_float' && hasHalfFloatExt) {
        return {};
      }
      if (name === 'OES_texture_half_float_linear' && hasHalfFloatExt) {
        return {};
      }
      return null;
    }),
    createFramebuffer: vi.fn(() => ({ id: 'fbo' })),
    deleteFramebuffer: vi.fn(),
    bindFramebuffer: vi.fn(),
    checkFramebufferStatus: vi.fn(() => (fboStatusComplete ? 0x8cd5 : 0x8cd6)),
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
    createShader: vi.fn(() => ({ id: 'shader' })),
    deleteShader: vi.fn(),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    createProgram: vi.fn(() => ({ id: 'program' })),
    deleteProgram: vi.fn(),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    useProgram: vi.fn(),
    getUniformLocation: vi.fn((_p, name) => ({ name })),
    getAttribLocation: vi.fn((_p, _name) => 0),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform1i: vi.fn(),
    drawArrays: vi.fn()
  };

  return gl as unknown as WebGL2RenderingContext;
}

describe('WebGLContextManager & HDR Framebuffer Pipeline', () => {
  let mockGl: WebGL2RenderingContext;

  beforeEach(() => {
    mockGl = createMockWebGL2Context(true, true);
  });

  it('initializes context manager and detects half-float extension support', () => {
    const manager = new WebGLContextManager(mockGl);
    expect(manager.isHalfFloatSupported()).toBe(true);
  });

  it('creates an RGBA16F half-float HDR framebuffer when supported', () => {
    const manager = new WebGLContextManager(mockGl);
    const fbo = manager.createHDRFramebuffer(800, 600);

    expect(fbo.width).toBe(800);
    expect(fbo.height).toBe(600);
    expect(fbo.isHDR).toBe(true);
    expect(mockGl.createFramebuffer).toHaveBeenCalled();
    expect(mockGl.createTexture).toHaveBeenCalled();
    expect(mockGl.texImage2D).toHaveBeenCalledWith(
      mockGl.TEXTURE_2D,
      0,
      mockGl.RGBA16F,
      800,
      600,
      0,
      mockGl.RGBA,
      mockGl.HALF_FLOAT,
      null
    );
  });

  it('falls back to 8-bit RGBA8 RGBM framebuffer when half-float extension is missing', () => {
    const noExtGl = createMockWebGL2Context(false, true);
    const manager = new WebGLContextManager(noExtGl);
    expect(manager.isHalfFloatSupported()).toBe(false);

    const fbo = manager.createHDRFramebuffer(800, 600);
    expect(fbo.isHDR).toBe(false); // Falls back to RGBM 8-bit
    expect(noExtGl.texImage2D).toHaveBeenCalledWith(
      noExtGl.TEXTURE_2D,
      0,
      noExtGl.RGBA8,
      800,
      600,
      0,
      noExtGl.RGBA,
      noExtGl.UNSIGNED_BYTE,
      null
    );
  });

  it('falls back to 8-bit RGBA8 when RGBA16F framebuffer creation status is incomplete', () => {
    // RGBA16F returns incomplete, then RGBA8 fallback returns complete
    const fallbackGl = createMockWebGL2Context(true, true);
    let callCount = 0;
    (fallbackGl.checkFramebufferStatus as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      return callCount === 1 ? fallbackGl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT : fallbackGl.FRAMEBUFFER_COMPLETE;
    });

    const manager = new WebGLContextManager(fallbackGl);
    const fbo = manager.createHDRFramebuffer(800, 600);
    expect(fbo.isHDR).toBe(false);
  });

  it('resizes existing framebuffer resources correctly', () => {
    const manager = new WebGLContextManager(mockGl);
    const fbo = manager.createHDRFramebuffer(800, 600);

    manager.resizeFramebuffer(fbo, 1920, 1080);
    expect(fbo.width).toBe(1920);
    expect(fbo.height).toBe(1080);
  });

  it('compiles and links shader programs', () => {
    const manager = new WebGLContextManager(mockGl);
    const program = manager.createProgram(
      '#version 300 es\nvoid main() { gl_Position = vec4(0.0); }',
      '#version 300 es\nout vec4 fragColor;\nvoid main() { fragColor = vec4(1.0); }'
    );

    expect(program).not.toBeNull();
    expect(mockGl.createProgram).toHaveBeenCalled();
    expect(mockGl.linkProgram).toHaveBeenCalled();
  });

  it('cleans up resources upon disposal', () => {
    const manager = new WebGLContextManager(mockGl);
    const fbo = manager.createHDRFramebuffer(800, 600);
    manager.deleteFramebuffer(fbo);

    expect(mockGl.deleteFramebuffer).toHaveBeenCalledWith(fbo.framebuffer);
    expect(mockGl.deleteTexture).toHaveBeenCalledWith(fbo.texture);
  });
});

describe('BeamPass (Pass 1 Forward Beam Rasterizer)', () => {
  let mockGl: WebGL2RenderingContext;
  let manager: WebGLContextManager;
  let beamPass: BeamPass;
  let packer: VboPacker;

  beforeEach(() => {
    mockGl = createMockWebGL2Context(true, true);
    manager = new WebGLContextManager(mockGl);
    beamPass = new BeamPass(manager);
    packer = new VboPacker(1024);
  });

  it('configures additive blending and disabled backface culling render states', () => {
    const fbo = manager.createHDRFramebuffer(800, 600);
    beamPass.begin(fbo, 800, 600);

    expect(mockGl.bindFramebuffer).toHaveBeenCalledWith(mockGl.FRAMEBUFFER, fbo.framebuffer);
    expect(mockGl.viewport).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(mockGl.enable).toHaveBeenCalledWith(mockGl.BLEND);
    expect(mockGl.blendFunc).toHaveBeenCalledWith(mockGl.SRC_ALPHA, mockGl.ONE);
    expect(mockGl.disable).toHaveBeenCalledWith(mockGl.CULL_FACE);
    expect(mockGl.disable).toHaveBeenCalledWith(mockGl.DEPTH_TEST);
  });

  it('renders beam vertices using 24-byte interleaved VBO layout', () => {
    const fbo = manager.createHDRFramebuffer(800, 600);
    beamPass.begin(fbo, 800, 600);

    // Pack synthetic triangle (3 vertices = 72 bytes)
    packer.writeVertex(100, 100, 1.0, 0.5, 0.0, 255, 255, 255);
    packer.writeVertex(200, 100, 1.0, 0.5, 1.0, 255, 255, 255);
    packer.writeVertex(150, 200, 1.0, 0.5, 0.5, 255, 255, 255);

    // First render calls bufferData (initial allocation)
    beamPass.render(packer);
    expect(mockGl.bufferData).toHaveBeenCalled();
    expect(mockGl.drawArrays).toHaveBeenCalledWith(mockGl.TRIANGLES, 0, 3);

    // Second render calls bufferSubData (zero-allocation sub-data update)
    beamPass.render(packer);
    expect(mockGl.bufferSubData).toHaveBeenCalled();
  });
});
