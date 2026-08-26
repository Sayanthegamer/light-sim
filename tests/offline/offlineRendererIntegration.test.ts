import { describe, it, expect } from 'vitest';
import { SceneGraph } from '../../src/engine/scene/sceneGraph';
import { EmitterNode } from '../../src/engine/scene/emitterNode';
import { PrismNode } from '../../src/engine/scene/prismNode';
import { LensNode, LensType } from '../../src/engine/scene/lensNode';
import { BarrierNode } from '../../src/engine/scene/barrierNode';
import { BlackHoleNode } from '../../src/engine/scene/blackHoleNode';
import { freezeSceneSnapshot, serializeSceneSnapshot, deserializeSceneSnapshot } from '../../src/engine/offline/sceneSnapshot';
import { AccumulationTarget } from '../../src/engine/offline/accumulationTarget';
import { tracePhotonPath, type IPhotonState } from '../../src/engine/offline/mcPhotonTracer';
import { sampleContinuousWavelength } from '../../src/engine/offline/spectralSampler';
import { encodeHDR, exportHDRBlob } from '../../src/engine/offline/hdrExporter';

describe('Offline Production Renderer End-to-End Pipeline', () => {
  it('executes end-to-end scene snapshot freeze, progressive Monte Carlo accumulation, and HDR export', () => {
    // 1. Build complex polymorphic scene
    const scene = new SceneGraph();

    const emitter = new EmitterNode('emitter_1', { x: 50, y: 150 }, 0, {
      beamWidth: 30,
      intensity: 1.0,
      isWhiteLight: true
    });

    const prism = new PrismNode('prism_1', { x: 200, y: 150 }, 0, {
      refractiveIndex: 1.5168,
      cauchyA: 1.5046,
      cauchyB: 4200
    });

    const lens = new LensNode('lens_1', { x: 350, y: 150 }, 0, {
      lensType: LensType.Biconvex,
      radius1: 120,
      radius2: 120,
      height: 100,
      thickness: 24,
      refractiveIndex: 1.62
    });

    const mirror = new BarrierNode('mirror_1', { x: 480, y: 100 }, -0.785, {
      length: 100,
      thickness: 6,
      isMirror: true
    });

    const bh = new BlackHoleNode('bh_1', { x: 550, y: 300 }, 0, {
      rs: 25
    });

    scene.addNode(emitter);
    scene.addNode(prism);
    scene.addNode(lens);
    scene.addNode(mirror);
    scene.addNode(bh);

    // 2. Freeze Scene Snapshot
    const width = 640;
    const height = 480;
    const renderJob = freezeSceneSnapshot(scene, width, height, {
      targetSamples: 50,
      batchPhotons: 1000,
      volumetricInScatter: true
    });

    // 3. Serialize & Deserialize over simulated Worker boundary
    const serialized = serializeSceneSnapshot(renderJob);
    const workerJob = deserializeSceneSnapshot(serialized);

    expect(workerJob.width).toBe(width);
    expect(workerJob.height).toBe(height);
    expect(workerJob.scene.emitters.length).toBe(1);
    expect(workerJob.scene.prisms.length).toBe(1);
    expect(workerJob.scene.lenses.length).toBe(1);
    expect(workerJob.scene.barriers.length).toBeGreaterThanOrEqual(1);
    expect(workerJob.scene.blackHoles.length).toBe(1);

    // 4. Progressive Monte Carlo Integration in AccumulationTarget
    const target = new AccumulationTarget(width, height);
    const photon: IPhotonState = {
      pos: { x: 0, y: 0 },
      dir: { x: 0, y: 0 },
      wavelengthNm: 550,
      energy: 1.0,
      phase: 0.0
    };

    const numPhotonsToTrace = 2000;
    for (let i = 0; i < numPhotonsToTrace; i++) {
      const em = workerJob.scene.emitters[0];
      const u = Math.random() - 0.5;
      const halfW = em.width * u;

      photon.pos.x = em.pos.x - em.dir.y * halfW;
      photon.pos.y = em.pos.y + em.dir.x * halfW;
      photon.dir.x = em.dir.x;
      photon.dir.y = em.dir.y;
      photon.wavelengthNm = sampleContinuousWavelength(em.spectrumType, em.spectrumParam, Math.random());
      photon.energy = em.power;
      photon.phase = Math.random() * 2.0 * Math.PI;

      tracePhotonPath(photon, workerJob.scene, target, {
        maxBounces: 32,
        volumetricInScatter: true
      });
    }

    // Verify accumulation buffer contains non-zero energy without NaNs
    let nonZeroCount = 0;
    let hasNaN = false;
    for (let i = 0; i < target.buffer.length; i++) {
      if (Number.isNaN(target.buffer[i]) || !Number.isFinite(target.buffer[i])) {
        hasNaN = true;
      }
      if (target.buffer[i] > 0) {
        nonZeroCount++;
      }
    }

    expect(hasNaN).toBe(false);
    expect(nonZeroCount).toBeGreaterThan(100);

    // 5. Tonemapping and Image Reconstruction
    const pixelBytes = new Uint8ClampedArray(width * height * 4);
    target.resolveToImageData(pixelBytes, { exposure: 1.5, tonemap: 'reinhard' });

    let nonZeroDisplayPixels = 0;
    for (let i = 0; i < pixelBytes.length; i += 4) {
      if (pixelBytes[i] > 0 || pixelBytes[i + 1] > 0 || pixelBytes[i + 2] > 0) {
        nonZeroDisplayPixels++;
      }
    }
    expect(nonZeroDisplayPixels).toBeGreaterThan(50);

    // 6. Radiance 32-bit HDR Binary File Export
    const hdrBytes = encodeHDR(target.buffer, width, height, 1.5);
    expect(hdrBytes.length).toBeGreaterThan(width * height * 4);

    const hdrBlob = exportHDRBlob(target.buffer, width, height, 1.5);
    expect(hdrBlob.size).toBe(hdrBytes.length);
    expect(hdrBlob.type).toBe('image/vnd.radiance');
  });
});
