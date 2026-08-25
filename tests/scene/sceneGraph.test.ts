import { describe, it, expect, beforeEach } from 'vitest';
import {
  SceneGraph,
  DirtyFlag,
  EmitterNode,
  PrismNode,
  LensNode,
  LensType,
  BlackHoleNode,
  BarrierNode
} from '../../src/engine/scene';

describe('SceneNode Base & Dirty Flag State Machine', () => {
  it('initializes with default transform and CLEAN flag', () => {
    const node = new PrismNode('p1', { x: 100, y: 100 }, 0);
    expect(node.id).toBe('p1');
    expect(node.position.x).toBe(100);
    expect(node.position.y).toBe(100);
    expect(node.rotation).toBe(0);
    expect(node.isDirty()).toBe(true); // Newly created node is initially dirty
  });

  it('marks TRANSFORM_DIRTY on translation and rotation updates', () => {
    const node = new PrismNode('p1', { x: 100, y: 100 }, 0);
    node.clearDirty();
    expect(node.isDirty()).toBe(false);

    node.setPosition(150, 200);
    expect(node.dirtyFlags & DirtyFlag.Transform).toBeTruthy();
    expect(node.isDirty()).toBe(true);

    node.clearDirty();
    node.setRotation(Math.PI / 4);
    expect(node.dirtyFlags & DirtyFlag.Transform).toBeTruthy();
  });

  it('marks PARAM_DIRTY on optical parameter changes', () => {
    const node = new PrismNode('p1', { x: 100, y: 100 }, 0, { refractiveIndex: 1.5 });
    node.clearDirty();
    expect(node.isDirty()).toBe(false);

    node.setRefractiveIndex(1.65);
    expect(node.dirtyFlags & DirtyFlag.Param).toBeTruthy();
  });

  it('transforms local points to world coordinates and vice versa correctly', () => {
    const node = new PrismNode('p1', { x: 200, y: 300 }, Math.PI / 2);
    const worldPt = node.localToWorld({ x: 10, y: 0 });
    expect(worldPt.x).toBeCloseTo(200, 4);
    expect(worldPt.y).toBeCloseTo(310, 4);

    const localPt = node.worldToLocal(worldPt);
    expect(localPt.x).toBeCloseTo(10, 4);
    expect(localPt.y).toBeCloseTo(0, 4);
  });
});

describe('Polymorphic Scene Nodes', () => {
  it('EmitterNode exposes aperture width, intensity, wavelength, and emits directional rays', () => {
    const emitter = new EmitterNode('e1', { x: 100, y: 200 }, 0, {
      beamWidth: 40,
      intensity: 1.0,
      wavelength: 532,
      isWhiteLight: false
    });

    expect(emitter.type).toBe('emitter');
    expect(emitter.beamWidth).toBe(40);
    expect(emitter.intensity).toBe(1.0);
    expect(emitter.wavelength).toBe(532);

    const rays = emitter.generateInitialRays();
    expect(rays.leftRay.origin.x).toBeCloseTo(100, 4);
    expect(rays.leftRay.origin.y).toBeCloseTo(180, 4); // 200 - 40/2
    expect(rays.rightRay.origin.y).toBeCloseTo(220, 4); // 200 + 40/2
    expect(rays.leftRay.dir.x).toBeCloseTo(1, 4);
    expect(rays.leftRay.dir.y).toBeCloseTo(0, 4);

    emitter.setBeamWidth(50);
    expect(emitter.beamWidth).toBe(50);
    emitter.setIntensity(2.0);
    expect(emitter.intensity).toBe(2.0);
    emitter.setWavelength(632);
    expect(emitter.wavelength).toBe(632);
    emitter.setIsWhiteLight(true);
    expect(emitter.isWhiteLight).toBe(true);

    expect(emitter.containsPoint({ x: 95, y: 200 })).toBe(true);
    expect(emitter.containsPoint({ x: 300, y: 300 })).toBe(false);
    expect(emitter.getBoundarySegments()).toEqual([]);
    expect(emitter.getBoundaryArcs()).toEqual([]);
    expect(emitter.getObstaclePolygon()).toEqual([]);
    expect(emitter.getObstacleCircle()).toBeNull();
  });

  it('PrismNode generates transformed boundary segments and obstacle polygon', () => {
    const prism = new PrismNode('prism1', { x: 300, y: 300 }, 0, {
      vertices: [
        { x: -50, y: -50 },
        { x: 50, y: -50 },
        { x: 0, y: 50 }
      ],
      refractiveIndex: 1.517,
      cauchyA: 1.5046,
      cauchyB: 0.0042
    });

    expect(prism.type).toBe('prism');
    const segments = prism.getBoundarySegments();
    expect(segments.length).toBe(3);
    expect(segments[0].n1).toBe(1.0);
    expect(segments[0].n2).toBe(1.517);
    expect(segments[0].cauchyA).toBe(1.5046);
    expect(segments[0].cauchyB).toBe(0.0042);

    const obstaclePoly = prism.getObstaclePolygon();
    expect(obstaclePoly.length).toBe(3);
    expect(obstaclePoly[0].x).toBeCloseTo(250, 4);
    expect(obstaclePoly[0].y).toBeCloseTo(250, 4);

    prism.setCauchy(1.6, 0.005);
    expect(prism.cauchyA).toBe(1.6);
    expect(prism.cauchyB).toBe(0.005);

    prism.setVertices([
      { x: -30, y: -30 },
      { x: 30, y: -30 },
      { x: 0, y: 30 }
    ]);
    expect(prism.vertices.length).toBe(3);

    expect(prism.getBoundaryArcs()).toEqual([]);
    expect(prism.getObstacleCircle()).toBeNull();
  });

  it('LensNode supports biconvex, biconcave, and planoconvex arc boundaries', () => {
    const lens = new LensNode('lens1', { x: 400, y: 300 }, 0, {
      lensType: LensType.Biconvex,
      radius1: 80,
      radius2: 80,
      height: 60,
      thickness: 20,
      refractiveIndex: 1.52
    });

    expect(lens.type).toBe('lens');
    const arcs = lens.getBoundaryArcs();
    expect(arcs.length).toBe(2);
    expect(arcs[0].nInside).toBe(1.52);
    expect(arcs[0].nOutside).toBe(1.0);

    const poly = lens.getObstaclePolygon();
    expect(poly.length).toBeGreaterThan(10);

    expect(lens.containsPoint({ x: 400, y: 300 })).toBe(true);
    expect(lens.containsPoint({ x: 600, y: 600 })).toBe(false);

    lens.setRefractiveIndex(1.6);
    expect(lens.refractiveIndex).toBe(1.6);
    lens.setCurvature(100, 100);
    expect(lens.radius1).toBe(100);
    lens.setAperture(80, 25);
    expect(lens.height).toBe(80);

    // Planoconvex
    const plano = new LensNode('lens2', { x: 200, y: 200 }, 0, {
      lensType: LensType.Planoconvex,
      radius1: 80,
      height: 60,
      thickness: 20
    });
    expect(plano.getBoundaryArcs().length).toBe(1);
    expect(plano.getBoundarySegments().length).toBe(1);
    expect(plano.getObstacleCircle()).toBeNull();
  });

  it('BlackHoleNode generates gravitational influence radius and event horizon circle', () => {
    const blackHole = new BlackHoleNode('bh1', { x: 500, y: 400 }, 0, {
      rs: 25
    });

    expect(blackHole.type).toBe('black_hole');
    expect(blackHole.rs).toBe(25);
    expect(blackHole.rInfluence).toBe(25 * 12); // 12 * rs

    const bhStruct = blackHole.getBlackHoleStruct();
    expect(bhStruct.center.x).toBe(500);
    expect(bhStruct.center.y).toBe(400);
    expect(bhStruct.rs).toBe(25);
    expect(bhStruct.rInfluence).toBe(300);

    const circle = blackHole.getObstacleCircle();
    expect(circle.center.x).toBe(500);
    expect(circle.radius).toBe(25);

    expect(blackHole.containsPoint({ x: 505, y: 405 })).toBe(true);
    expect(blackHole.containsPoint({ x: 600, y: 600 })).toBe(false);

    blackHole.setRs(30);
    expect(blackHole.rs).toBe(30);
    expect(blackHole.getBoundarySegments()).toEqual([]);
    expect(blackHole.getBoundaryArcs()).toEqual([]);
    expect(blackHole.getObstaclePolygon()).toEqual([]);
  });

  it('BarrierNode generates reflective mirror or absorptive obstacle segments', () => {
    const barrier = new BarrierNode('bar1', { x: 300, y: 200 }, Math.PI / 2, {
      length: 100,
      thickness: 4,
      isMirror: true
    });

    expect(barrier.type).toBe('barrier');
    expect(barrier.isMirror).toBe(true);

    const segments = barrier.getBoundarySegments();
    expect(segments.length).toBe(4);
    expect(segments[0].isMirror).toBe(true);
    expect(segments[0].isBarrier).toBe(false);

    barrier.setIsMirror(false);
    expect(barrier.isMirror).toBe(false);
    expect(barrier.getBoundarySegments()[0].isBarrier).toBe(true);

    barrier.setDimensions(150, 8);
    expect(barrier.length).toBe(150);
    expect(barrier.thickness).toBe(8);

    expect(barrier.containsPoint({ x: 300, y: 200 })).toBe(true);
    expect(barrier.containsPoint({ x: 500, y: 500 })).toBe(false);
    expect(barrier.getBoundaryArcs()).toEqual([]);
    expect(barrier.getObstacleCircle()).toBeNull();
  });
});

describe('SceneGraph & Contiguous Flat Physics Cache', () => {
  let scene: SceneGraph;

  beforeEach(() => {
    scene = new SceneGraph();
  });

  it('adds, retrieves, and removes scene nodes', () => {
    const prism = new PrismNode('p1', { x: 100, y: 100 }, 0);
    scene.addNode(prism);
    expect(scene.getNode('p1')).toBe(prism);
    expect(scene.getAllNodes().length).toBe(1);

    scene.removeNode('p1');
    expect(scene.getNode('p1')).toBeUndefined();
    expect(scene.getAllNodes().length).toBe(0);
  });

  it('extracts emitter nodes correctly', () => {
    const emitter = new EmitterNode('e1', { x: 50, y: 50 }, 0);
    const prism = new PrismNode('p1', { x: 100, y: 100 }, 0);
    scene.addNode(emitter);
    scene.addNode(prism);

    const emitters = scene.getEmitters();
    expect(emitters.length).toBe(1);
    expect(emitters[0].id).toBe('e1');
  });

  it('flattens geometry into contiguous cached arrays on dirty updates', () => {
    const prism = new PrismNode('p1', { x: 100, y: 100 }, 0);
    const bh = new BlackHoleNode('bh1', { x: 400, y: 300 }, 0, { rs: 20 });
    scene.addNode(prism);
    scene.addNode(bh);

    // Initial sync
    scene.updateFlatCache();
    expect(scene.getCachedSegments().length).toBe(3);
    expect(scene.getCachedBlackHoles().length).toBe(1);
    expect(scene.getCachedObstaclePolygons().length).toBe(1);
    expect(scene.getCachedObstacleCircles().length).toBe(1);

    // No-op when clean
    const prevSegs = scene.getCachedSegments();
    scene.updateFlatCache();
    expect(scene.getCachedSegments()).toBe(prevSegs); // Same array reference without re-allocation

    // Modifying node triggers cache update
    prism.setPosition(200, 200);
    expect(scene.isDirty()).toBe(true);
    scene.updateFlatCache();
    expect(scene.isDirty()).toBe(false);
  });

  it('finds node by id or position hit test and clears correctly', () => {
    const prism = new PrismNode('p1', { x: 100, y: 100 }, 0, {
      vertices: [
        { x: -30, y: -30 },
        { x: 30, y: -30 },
        { x: 0, y: 30 }
      ]
    });
    scene.addNode(prism);

    const hit = scene.findNodeAt({ x: 100, y: 100 });
    expect(hit?.id).toBe('p1');

    const miss = scene.findNodeAt({ x: 500, y: 500 });
    expect(miss).toBeNull();

    scene.clear();
    expect(scene.getAllNodes().length).toBe(0);
    expect(scene.getCachedSegments().length).toBe(0);
  });
});
