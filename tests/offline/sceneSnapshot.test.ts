import { describe, it, expect } from 'vitest';
import { SceneGraph } from '../../src/engine/scene/sceneGraph';
import { EmitterNode } from '../../src/engine/scene/emitterNode';
import { PrismNode } from '../../src/engine/scene/prismNode';
import { BarrierNode } from '../../src/engine/scene/barrierNode';
import { BlackHoleNode } from '../../src/engine/scene/blackHoleNode';
import {
  freezeSceneSnapshot,
  serializeSceneSnapshot,
  deserializeSceneSnapshot
} from '../../src/engine/offline/sceneSnapshot';

describe('Scene Snapshot & Worker Freeze Protocol', () => {
  it('freezes live polymorphic scene graph into immutable transferable snapshot payload', () => {
    const scene = new SceneGraph();

    const emitter = new EmitterNode('1', { x: 100, y: 200 }, 0, { beamWidth: 40, intensity: 1.0, wavelength: 550 });
    const prism = new PrismNode('2', { x: 300, y: 200 }, 0, { refractiveIndex: 1.5168 });
    const barrier = new BarrierNode('3', { x: 500, y: 100 }, 0, { length: 120, thickness: 6, isMirror: false });
    const bh = new BlackHoleNode('4', { x: 700, y: 400 }, 0, { rs: 40 });

    scene.addNode(emitter);
    scene.addNode(prism);
    scene.addNode(barrier);
    scene.addNode(bh);

    const snapshot = freezeSceneSnapshot(scene, 1920, 1080);

    expect(snapshot.width).toBe(1920);
    expect(snapshot.height).toBe(1080);
    expect(snapshot.scene.emitters).toHaveLength(1);
    expect(snapshot.scene.prisms).toHaveLength(1);
    expect(snapshot.scene.barriers.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.scene.blackHoles).toHaveLength(1);
    expect(snapshot.scene.prisms[0].vertices.length).toBeGreaterThanOrEqual(3);
  });

  it('serializes and deserializes snapshot across postMessage boundary', () => {
    const scene = new SceneGraph();
    const emitter = new EmitterNode('1', { x: 50, y: 50 }, 0, { beamWidth: 20, intensity: 1.0, wavelength: 650 });
    scene.addNode(emitter);

    const snapshot = freezeSceneSnapshot(scene, 800, 600);
    const jsonStr = serializeSceneSnapshot(snapshot);
    const restored = deserializeSceneSnapshot(jsonStr);

    expect(restored.width).toBe(800);
    expect(restored.height).toBe(600);
    expect(restored.scene.emitters[0].pos.x).toBe(50);
  });
});
