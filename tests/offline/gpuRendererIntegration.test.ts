import { describe, it, expect, vi } from 'vitest';
import { SceneGraph } from '../../src/engine/scene/sceneGraph';
import { EmitterNode } from '../../src/engine/scene/emitterNode';
import { PrismNode } from '../../src/engine/scene/prismNode';
import { freezeSceneSnapshot } from '../../src/engine/offline/sceneSnapshot';
import { MultiDeviceDispatcher } from '../../src/engine/offline/multiDeviceManager';
import { WebGpuContext } from '../../src/engine/offline/gpu/webgpuContext';
import { exportHDRBlob } from '../../src/engine/offline/hdrExporter';

describe('GPU Production Renderer Integration Pipeline', () => {
  it('executes end-to-end scene snapshot freeze, WebGPU progressive accumulation, and HDR export', async () => {
    // 1. Setup Scene Graph
    const scene = new SceneGraph();
    const emitter = new EmitterNode('test_laser', { x: 50, y: 150 }, 0, {
      beamWidth: 10,
      intensity: 1.0,
      wavelength: 550
    });
    const prism = new PrismNode('test_prism', { x: 100, y: 150 }, 0, {
      vertices: [
        { x: -50, y: -50 },
        { x: 50, y: -50 },
        { x: 0, y: 50 }
      ],
      refractiveIndex: 1.5
    });
    scene.addNode(emitter);
    scene.addNode(prism);

    // 2. Freeze Scene Snapshot
    const job = freezeSceneSnapshot(scene, 120, 90, {
      targetSamples: 5,
      batchPhotons: 1000,
      volumetricInScatter: true
    });

    expect(job.scene.emitters.length).toBe(1);
    expect(job.scene.prisms.length).toBe(1);

    // 3. Mock WebGPU Environment
    const mockDevice = {
      createShaderModule: vi.fn().mockReturnValue({}),
      createComputePipeline: vi.fn().mockReturnValue({ getBindGroupLayout: vi.fn().mockReturnValue({}) }),
      createRenderPipeline: vi.fn().mockReturnValue({ getBindGroupLayout: vi.fn().mockReturnValue({}) }),
      createTexture: vi.fn().mockReturnValue({ createView: vi.fn().mockReturnValue({}), destroy: vi.fn() }),
      createBuffer: vi.fn().mockReturnValue({
        mapAsync: vi.fn().mockResolvedValue(undefined),
        getMappedRange: vi.fn().mockReturnValue(new Float32Array(120 * 90 * 4).buffer),
        unmap: vi.fn(),
        destroy: vi.fn()
      }),
      createBindGroup: vi.fn().mockReturnValue({}),
      createCommandEncoder: vi.fn().mockReturnValue({
        beginRenderPass: vi.fn().mockReturnValue({ setPipeline: vi.fn(), setBindGroup: vi.fn(), draw: vi.fn(), end: vi.fn() }),
        beginComputePass: vi.fn().mockReturnValue({ setPipeline: vi.fn(), setBindGroup: vi.fn(), dispatchWorkgroups: vi.fn(), end: vi.fn() }),
        copyTextureToBuffer: vi.fn(),
        finish: vi.fn().mockReturnValue({})
      }),
      destroy: vi.fn(),
      queue: {
        writeBuffer: vi.fn(),
        submit: vi.fn()
      }
    } as unknown as GPUDevice;

    const mockGpuContext = new WebGpuContext({} as GPUAdapter, mockDevice);

    const { WebGpuComputeDispatcher } = await import('../../src/engine/offline/gpu/webgpuComputeDispatcher');
    const { GpuWorkerAdapter } = await import('../../src/engine/offline/multiDeviceManager');

    const gpuDispatcher = new GpuWorkerAdapter(new WebGpuComputeDispatcher(async () => mockGpuContext));
    const multi = new MultiDeviceDispatcher({ gpuDispatcher });

    let finalBuffer: Float32Array | null = null;
    let completedPasses = 0;

    await new Promise<void>((resolve) => {
      multi.start(
        job,
        'gpu',
        (progress) => {
          completedPasses = progress.pass;
        },
        (buffer) => {
          finalBuffer = buffer;
          resolve();
        }
      );
    });

    expect(completedPasses).toBeGreaterThanOrEqual(5);
    expect(finalBuffer).not.toBeNull();
    expect(finalBuffer!.length).toBe(120 * 90 * 4);

    // 4. Validate HDR Radiance Blob Export
    const hdrBlob = exportHDRBlob(finalBuffer!, 120, 90, 1.0);
    expect(hdrBlob).toBeInstanceOf(Blob);
    expect(hdrBlob.size).toBeGreaterThan(0);
    expect(hdrBlob.type).toBe('image/vnd.radiance');
  });
});
