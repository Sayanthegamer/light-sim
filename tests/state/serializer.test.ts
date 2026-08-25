import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, PrismNode, EmitterNode, BlackHoleNode, LensNode, LensType } from '../../src/engine/scene';
import {
  serializeScene,
  deserializeScene,
  serializeToJSON,
  deserializeFromJSON,
  encodeToURLHash,
  decodeFromURLHash,
  syncToURL,
  loadFromCurrentURL
} from '../../src/engine/state/serializer';
import {
  newtonPrismPreset,
  convexConcaveFocusPreset,
  schwarzschildDeflectionPreset,
  tirRetroreflectorPreset,
  achromaticDoubletPreset,
  ALL_PRESETS
} from '../../src/engine/presets';

describe('Serializer & LZ-String URL Compression', () => {
  let scene: SceneGraph;

  beforeEach(() => {
    scene = new SceneGraph();
  });

  it('serializes and deserializes a complex optical scene with high physical fidelity', () => {
    const emitter = new EmitterNode('e1', { x: 100, y: 200 }, 0, {
      beamWidth: 50,
      intensity: 1.5,
      wavelength: 650,
      isWhiteLight: false
    });
    const prism = new PrismNode('p1', { x: 300, y: 200 }, Math.PI / 6, {
      refractiveIndex: 1.62,
      cauchyA: 1.58,
      cauchyB: 0.006,
      isDispersive: true
    });
    const bh = new BlackHoleNode('bh1', { x: 500, y: 400 }, 0, { rs: 30 });

    scene.addNode(emitter);
    scene.addNode(prism);
    scene.addNode(bh);

    const json = serializeToJSON(scene, { name: 'Test Scene' });
    expect(typeof json).toBe('string');

    const restoredScene = deserializeFromJSON(json);
    expect(restoredScene.getAllNodes().length).toBe(3);

    const restoredEmitter = restoredScene.getNode('e1') as EmitterNode;
    expect(restoredEmitter).toBeDefined();
    expect(restoredEmitter.beamWidth).toBe(50);
    expect(restoredEmitter.intensity).toBe(1.5);
    expect(restoredEmitter.wavelength).toBe(650);

    const restoredPrism = restoredScene.getNode('p1') as PrismNode;
    expect(restoredPrism).toBeDefined();
    expect(restoredPrism.refractiveIndex).toBe(1.62);
    expect(restoredPrism.rotation).toBeCloseTo(Math.PI / 6, 4);

    const restoredBH = restoredScene.getNode('bh1') as BlackHoleNode;
    expect(restoredBH).toBeDefined();
    expect(restoredBH.rs).toBe(30);
    expect(restoredBH.rInfluence).toBe(360);
  });

  it('encodes scene into a compact Base64 LZ-String URL hash and decodes cleanly', () => {
    const lens = new LensNode('l1', { x: 300, y: 300 }, 0, {
      lensType: LensType.Biconvex,
      height: 80,
      thickness: 25,
      refractiveIndex: 1.52
    });
    scene.addNode(lens);

    const hash = encodeToURLHash(scene);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);

    const decodedScene = decodeFromURLHash(hash);
    expect(decodedScene).not.toBeNull();
    expect(decodedScene?.getAllNodes().length).toBe(1);

    const restoredLens = decodedScene?.getNode('l1') as LensNode;
    expect(restoredLens).toBeDefined();
    expect(restoredLens.lensType).toBe(LensType.Biconvex);
    expect(restoredLens.height).toBe(80);
    expect(restoredLens.thickness).toBe(25);
  });

  it('returns null when decoding an invalid or corrupted hash', () => {
    const res = decodeFromURLHash('invalid_corrupted_hash_!!!');
    expect(res).toBeNull();
  });

  it('serializes scene metadata and syncs to/from window.location.hash in browser env', () => {
    const emitter = new EmitterNode('e1', { x: 100, y: 100 }, 0);
    scene.addNode(emitter);

    const serialized = serializeScene(scene, { name: 'My Setup', description: 'Laser dispersion' });
    expect(serialized.name).toBe('My Setup');
    expect(serialized.description).toBe('Laser dispersion');
    expect(serialized.nodes.length).toBe(1);

    // Mock window in Node.js environment
    const fakeWindow = { location: { hash: '' } };
    vi.stubGlobal('window', fakeWindow);

    syncToURL(scene);
    expect(fakeWindow.location.hash.length).toBeGreaterThan(1);

    const loaded = loadFromCurrentURL();
    expect(loaded).not.toBeNull();
    expect(loaded?.getAllNodes().length).toBe(1);

    vi.unstubAllGlobals();
  });
});

describe('5 Bundled Presets Library', () => {
  it('loads all 5 classic optical presets with valid geometries and emitters', () => {
    expect(ALL_PRESETS.length).toBe(5);

    const presets = [
      newtonPrismPreset,
      convexConcaveFocusPreset,
      schwarzschildDeflectionPreset,
      tirRetroreflectorPreset,
      achromaticDoubletPreset
    ];

    for (const preset of presets) {
      expect(preset.name).toBeDefined();
      expect(preset.description).toBeDefined();
      expect(preset.nodes.length).toBeGreaterThanOrEqual(1);

      const scene = deserializeScene(preset);
      expect(scene.getAllNodes().length).toBe(preset.nodes.length);
      expect(scene.getEmitters().length).toBeGreaterThanOrEqual(1);
    }
  });

  it('verifies Newton Prism preset configuration', () => {
    const scene = deserializeScene(newtonPrismPreset);
    const emitter = scene.getEmitters()[0];
    expect(emitter.isWhiteLight).toBe(true);

    const prism = scene.getAllNodes().find(n => n.type === 'prism') as PrismNode;
    expect(prism).toBeDefined();
    expect(prism.isDispersive).toBe(true);
  });

  it('verifies Schwarzschild Relativistic Deflection preset configuration', () => {
    const scene = deserializeScene(schwarzschildDeflectionPreset);
    const bh = scene.getAllNodes().find(n => n.type === 'black_hole') as BlackHoleNode;
    expect(bh).toBeDefined();
    expect(bh.rs).toBeGreaterThan(10);
    expect(bh.rInfluence).toBe(bh.rs * 12);
  });
});
