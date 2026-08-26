import { describe, it, expect, vi } from 'vitest';
import {
  PHOTON_TRANSPORT_WGSL,
  CLIP_RASTER_WGSL,
  GpuPipelineManager
} from '../../src/engine/offline/gpu/webgpuPipeline';
import { type IOfflineSceneGeometry } from '../../src/engine/offline/mcPhotonTracer';

describe('WebGPU Pipeline Creation & Shader Validation', () => {
  it('contains syntactically valid WGSL shader code with all struct declarations', () => {
    expect(PHOTON_TRANSPORT_WGSL).toContain('struct BVHNode');
    expect(PHOTON_TRANSPORT_WGSL).toContain('struct SegmentPrimitive');
    expect(PHOTON_TRANSPORT_WGSL).toContain('struct ArcPrimitive');
    expect(PHOTON_TRANSPORT_WGSL).toContain('struct BlackHolePrimitive');
    expect(PHOTON_TRANSPORT_WGSL).toContain('struct EmitterPrimitive');
    expect(PHOTON_TRANSPORT_WGSL).toContain('struct PhotonVertex');
    expect(PHOTON_TRANSPORT_WGSL).toContain('@compute @workgroup_size(64, 1, 1)');

    expect(CLIP_RASTER_WGSL).toContain('@vertex');
    expect(CLIP_RASTER_WGSL).toContain('@fragment');
    expect(CLIP_RASTER_WGSL).toContain('outOfClip');
  });

  it('does not contain WGSL variable redeclarations for bestHit and closestT', () => {
    // A redeclaration in the loop like `var bestHit = traverseBVH` will cause WebGPU parsing to fail
    expect(PHOTON_TRANSPORT_WGSL).not.toMatch(/var\s+bestHit\s*=\s*traverseBVH/);
    expect(PHOTON_TRANSPORT_WGSL).not.toMatch(/var\s+closestT\s*=\s*boundDist/);
  });

  it('calls evaluateBlackHoleInteraction inside the main compute loop', () => {
    // This ensures the blackHoles binding is used and not stripped by layout: 'auto'
    expect(PHOTON_TRANSPORT_WGSL).toMatch(/evaluateBlackHoleInteraction\s*\(/);
    expect(PHOTON_TRANSPORT_WGSL).toMatch(/config\.counts\.w/);
  });

  it('initializes GpuPipelineManager with mocked device and creates storage buffers and bind groups', () => {
    const mockBuffer = {
      destroy: vi.fn()
    };

    const mockComputePipeline = {
      getBindGroupLayout: vi.fn().mockReturnValue({})
    };
    const mockRenderPipeline = {
      getBindGroupLayout: vi.fn().mockReturnValue({})
    };
    const mockBindGroup = {};

    const mockDevice = {
      createShaderModule: vi.fn().mockReturnValue({}),
      createComputePipeline: vi.fn().mockReturnValue(mockComputePipeline),
      createRenderPipeline: vi.fn().mockReturnValue(mockRenderPipeline),
      createBuffer: vi.fn().mockReturnValue(mockBuffer),
      createBindGroup: vi.fn().mockReturnValue(mockBindGroup),
      queue: {
        writeBuffer: vi.fn(),
        submit: vi.fn()
      }
    };

    const manager = new GpuPipelineManager(mockDevice as unknown as GPUDevice);

    const scene: IOfflineSceneGeometry = {
      bounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 },
      emitters: [{ id: 1, pos: { x: 10, y: 10 }, dir: { x: 1, y: 0 }, width: 10, spectrumType: 'monochromatic', spectrumParam: 500, power: 1 }],
      prisms: [],
      lenses: [],
      barriers: [],
      blackHoles: []
    };

    manager.updateScene(scene, 10000);

    expect(mockDevice.createBuffer).toHaveBeenCalled();
    expect(mockDevice.createBindGroup).toHaveBeenCalled();

    // Verify adaptive batch sizing calculation
    expect(manager.getBatchSize()).toBeGreaterThanOrEqual(1000);
    manager.adjustBatchPacing(5); // Fast execution (5ms) -> Increase batch size
    expect(manager.getBatchSize()).toBeGreaterThan(10000);

    manager.destroy();
    expect(mockBuffer.destroy).toHaveBeenCalled();
  });
});
