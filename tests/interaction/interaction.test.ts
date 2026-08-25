import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SceneGraph, PrismNode, EmitterNode, BlackHoleNode, LensNode, BarrierNode } from '../../src/engine/scene';
import {
  HitTester,
  HandleType,
  GizmoController
} from '../../src/engine/interaction';

describe('HitTester (Direct 2D Canvas Vector Raycasting)', () => {
  let scene: SceneGraph;
  let hitTester: HitTester;

  beforeEach(() => {
    scene = new SceneGraph();
    hitTester = new HitTester();
  });

  it('detects body hit on unselected and selected nodes', () => {
    const prism = new PrismNode('p1', { x: 200, y: 200 }, 0, {
      vertices: [
        { x: -40, y: -40 },
        { x: 40, y: -40 },
        { x: 0, y: 40 }
      ]
    });
    scene.addNode(prism);

    const hit = hitTester.hitTest(scene, { x: 200, y: 200 });
    expect(hit.hit).toBe(true);
    expect(hit.node?.id).toBe('p1');
    expect(hit.handleType).toBe(HandleType.Body);

    const miss = hitTester.hitTest(scene, { x: 500, y: 500 });
    expect(miss.hit).toBe(false);
  });

  it('prioritizes gizmo rotation and resize handles when a node is selected', () => {
    const emitter = new EmitterNode('e1', { x: 300, y: 300 }, 0, { beamWidth: 40 });
    scene.addNode(emitter);

    // Hit test with selectedNodeId = 'e1'
    const rotHandle = hitTester.getRotationHandle(emitter);
    const hitRot = hitTester.hitTest(scene, rotHandle.position, 'e1');
    expect(hitRot.hit).toBe(true);
    expect(hitRot.handleType).toBe(HandleType.Rotate);
    expect(hitRot.node?.id).toBe('e1');
  });
});

describe('GizmoController (Translation, Rotation, and Resize)', () => {
  let scene: SceneGraph;
  let controller: GizmoController;
  let onUpdateMock: () => void;
  let onCommitMock: () => void;

  beforeEach(() => {
    scene = new SceneGraph();
    onUpdateMock = vi.fn();
    onCommitMock = vi.fn();
    controller = new GizmoController(scene, {
      onInteractionUpdate: onUpdateMock,
      onInteractionCommit: onCommitMock
    });
  });

  it('selects node on pointer down and translates position on drag', () => {
    const prism = new PrismNode('p1', { x: 200, y: 200 }, 0, {
      vertices: [
        { x: -40, y: -40 },
        { x: 40, y: -40 },
        { x: 0, y: 40 }
      ]
    });
    scene.addNode(prism);

    // Pointer down on body
    const handledDown = controller.onPointerDown(200, 200);
    expect(handledDown).toBe(true);
    expect(controller.getSelectedNode()?.id).toBe('p1');
    expect(controller.getSelectedNodeId()).toBe('p1');

    // Pointer move (drag by +50, +30)
    controller.onPointerMove(250, 230);
    expect(prism.position.x).toBe(250);
    expect(prism.position.y).toBe(230);
    expect(onUpdateMock).toHaveBeenCalled();

    // Pointer up commits interaction
    controller.onPointerUp();
    expect(controller.isDragging()).toBe(false);
    expect(onCommitMock).toHaveBeenCalled();
  });

  it('rotates node smoothly when dragging rotation gizmo handle', () => {
    const emitter = new EmitterNode('e1', { x: 200, y: 200 }, 0, { beamWidth: 40 });
    scene.addNode(emitter);
    controller.selectNode('e1');

    const handles = controller.getGizmoHandles();
    const rotHandle = handles.find(h => h.type === HandleType.Rotate);
    expect(rotHandle).toBeDefined();

    if (rotHandle) {
      controller.onPointerDown(rotHandle.position.x, rotHandle.position.y);
      // Drag pointer to (200, 250) -> angle = 90 deg = Math.PI / 2
      controller.onPointerMove(200, 250);
      expect(emitter.rotation).toBeCloseTo(Math.PI / 2, 2);

      controller.onPointerUp();
      expect(onCommitMock).toHaveBeenCalled();
    }
  });

  it('resizes emitter aperture width when dragging aperture handle', () => {
    const emitter = new EmitterNode('e1', { x: 200, y: 200 }, 0, { beamWidth: 40 });
    scene.addNode(emitter);
    controller.selectNode('e1');

    const handles = controller.getGizmoHandles();
    const resizeHandle = handles.find(h => h.type === HandleType.ResizePrimary);
    expect(resizeHandle).toBeDefined();

    if (resizeHandle) {
      controller.onPointerDown(resizeHandle.position.x, resizeHandle.position.y);
      controller.onPointerMove(200, 240);
      expect(emitter.beamWidth).toBeGreaterThan(40);

      controller.onPointerUp();
    }
  });

  it('resizes black hole Schwarzschild radius rs when dragging radius handle', () => {
    const bh = new BlackHoleNode('bh1', { x: 300, y: 300 }, 0, { rs: 20 });
    scene.addNode(bh);
    controller.selectNode('bh1');

    const handles = controller.getGizmoHandles();
    const radiusHandle = handles.find(h => h.type === HandleType.ResizePrimary);
    expect(radiusHandle).toBeDefined();

    if (radiusHandle) {
      controller.onPointerDown(radiusHandle.position.x, radiusHandle.position.y);
      controller.onPointerMove(340, 300);
      expect(bh.rs).toBeCloseTo(40, 1);
      expect(bh.rInfluence).toBeCloseTo(480, 1);

      controller.onPointerUp();
    }
  });

  it('resizes barrier length when dragging barrier resize handle', () => {
    const bar = new BarrierNode('bar1', { x: 200, y: 200 }, 0, { length: 80 });
    scene.addNode(bar);
    controller.selectNode('bar1');

    const handles = controller.getGizmoHandles();
    const resizeHandle = handles.find(h => h.type === HandleType.ResizePrimary);
    expect(resizeHandle).toBeDefined();

    if (resizeHandle) {
      controller.onPointerDown(resizeHandle.position.x, resizeHandle.position.y);
      controller.onPointerMove(200, 260); // half-length 60 -> length 120
      expect(bar.length).toBeGreaterThan(80);

      controller.onPointerUp();
    }
  });

  it('resizes lens height when dragging lens resize handle', () => {
    const lens = new LensNode('lens1', { x: 200, y: 200 }, 0, { height: 60 });
    scene.addNode(lens);
    controller.selectNode('lens1');

    const handles = controller.getGizmoHandles();
    const resizeHandle = handles.find(h => h.type === HandleType.ResizePrimary);
    expect(resizeHandle).toBeDefined();

    if (resizeHandle) {
      controller.onPointerDown(resizeHandle.position.x, resizeHandle.position.y);
      controller.onPointerMove(200, 250);
      expect(lens.height).toBeGreaterThan(60);

      controller.onPointerUp();
    }
  });

  it('deselects node when clicking empty canvas space', () => {
    const prism = new PrismNode('p1', { x: 200, y: 200 }, 0);
    scene.addNode(prism);
    controller.selectNode('p1');
    expect(controller.getSelectedNode()?.id).toBe('p1');

    controller.onPointerDown(800, 800);
    expect(controller.getSelectedNode()).toBeNull();
  });
});
