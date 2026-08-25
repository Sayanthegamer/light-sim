/**
 * WebGL2 Context & Resource Manager
 *
 * Manages WebGL2 context state, half-float RGBA16F / 8-bit RGBM fallback framebuffers,
 * single-channel R8 mask framebuffers, shader compilation, program linking, and GPU resource lifetimes.
 */

export interface FramebufferResource {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
  isHDR: boolean;
  internalFormat: number;
  format: number;
  type: number;
}

export interface WebGLContextOptions {
  alpha?: boolean;
  antialias?: boolean;
  depth?: boolean;
  preserveDrawingBuffer?: boolean;
}

export class WebGLContextManager {
  readonly gl: WebGL2RenderingContext;
  private readonly halfFloatExt: unknown | null;
  private readonly halfFloatLinearExt: unknown | null;

  readonly screenQuadVao: WebGLVertexArrayObject | null = null;
  readonly screenQuadVbo: WebGLBuffer | null = null;

  constructor(glOrCanvas: WebGL2RenderingContext | HTMLCanvasElement, options?: WebGLContextOptions) {
    if ('getContext' in glOrCanvas) {
      const gl = glOrCanvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        preserveDrawingBuffer: false,
        ...options
      });
      if (!gl) {
        throw new Error('WebGL2 is not supported by your browser or hardware.');
      }
      this.gl = gl;
    } else {
      this.gl = glOrCanvas;
    }

    this.halfFloatExt =
      this.gl.getExtension('EXT_color_buffer_float') ||
      this.gl.getExtension('EXT_color_buffer_half_float');
    this.halfFloatLinearExt =
      this.gl.getExtension('OES_texture_float_linear') ||
      this.gl.getExtension('OES_texture_half_float_linear');

    // Create shared Fullscreen Triangle VAO and VBO
    this.screenQuadVao = this.gl.createVertexArray();
    this.screenQuadVbo = this.gl.createBuffer();
    if (this.screenQuadVao && this.screenQuadVbo) {
      this.gl.bindVertexArray(this.screenQuadVao);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.screenQuadVbo);
      const quad = new Float32Array([
        -1.0, -1.0,
         3.0, -1.0,
        -1.0,  3.0
      ]);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, quad, this.gl.STATIC_DRAW);
      this.gl.enableVertexAttribArray(0);
      this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0);
      this.gl.bindVertexArray(null);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    }
  }

  renderScreenQuad(): void {
    const gl = this.gl;
    if (this.screenQuadVao) {
      gl.bindVertexArray(this.screenQuadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    }
  }

  isHalfFloatSupported(): boolean {
    return this.halfFloatExt !== null;
  }

  isHalfFloatLinearFilteringSupported(): boolean {
    return this.halfFloatLinearExt !== null;
  }

  createHDRFramebuffer(width: number, height: number): FramebufferResource {
    const gl = this.gl;
    const preferHDR = this.isHalfFloatSupported();

    if (preferHDR) {
      const fbo = this.tryCreateFbo(width, height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, true);
      if (fbo) {
        return fbo;
      }
    }

    // Fallback to 8-bit RGBM RGBA8
    const fallbackFbo = this.tryCreateFbo(width, height, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, false);
    if (!fallbackFbo) {
      throw new Error('Failed to create fallback RGBA8 framebuffer.');
    }
    return fallbackFbo;
  }

  createSingleChannelFramebuffer(width: number, height: number): FramebufferResource {
    const gl = this.gl;
    const fbo = this.tryCreateFbo(width, height, gl.R8, gl.RED, gl.UNSIGNED_BYTE, false);
    if (!fbo) {
      throw new Error('Failed to create single-channel R8 mask framebuffer.');
    }
    return fbo;
  }

  private tryCreateFbo(
    width: number,
    height: number,
    internalFormat: number,
    format: number,
    type: number,
    isHDR: boolean
  ): FramebufferResource | null {
    const gl = this.gl;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();

    if (!texture || !framebuffer) {
      return null;
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);
    let minFilter: number = gl.LINEAR;
    let magFilter: number = gl.LINEAR;

    if (isHDR && !this.isHalfFloatLinearFilteringSupported()) {
      minFilter = gl.NEAREST;
      magFilter = gl.NEAREST;
    }

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      return null;
    }

    return {
      framebuffer,
      texture,
      width,
      height,
      isHDR,
      internalFormat,
      format,
      type
    };
  }

  resizeFramebuffer(fbo: FramebufferResource, width: number, height: number): void {
    if (fbo.width === width && fbo.height === height) {
      return;
    }
    const gl = this.gl;
    fbo.width = width;
    fbo.height = height;

    gl.bindTexture(gl.TEXTURE_2D, fbo.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      fbo.internalFormat,
      width,
      height,
      0,
      fbo.format,
      fbo.type,
      null
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  deleteFramebuffer(fbo: FramebufferResource): void {
    const gl = this.gl;
    gl.deleteFramebuffer(fbo.framebuffer);
    gl.deleteTexture(fbo.texture);
  }

  createShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) {
      throw new Error('Failed to create WebGL shader object.');
    }

    let processedSource = source;
    if (type === gl.FRAGMENT_SHADER && !this.isHalfFloatSupported()) {
      processedSource = source.replace('#version 300 es', '#version 300 es\n#define USE_RGBM\n');
    }

    gl.shaderSource(shader, processedSource);
    gl.compileShader(shader);

    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!success) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`WebGL shader compilation failed: ${info ?? 'unknown error'}`);
    }

    return shader;
  }

  createProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
    const gl = this.gl;
    const vertShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
    const fragShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertShader);
      gl.deleteShader(fragShader);
      throw new Error('Failed to create WebGL program object.');
    }

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);

    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!success) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`WebGL program linking failed: ${info ?? 'unknown error'}`);
    }

    return program;
  }

  dispose(): void {
    const gl = this.gl;
    if (this.screenQuadVao) gl.deleteVertexArray(this.screenQuadVao);
    if (this.screenQuadVbo) gl.deleteBuffer(this.screenQuadVbo);
  }
}
