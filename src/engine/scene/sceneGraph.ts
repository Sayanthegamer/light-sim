/**
 * SceneGraph: Polymorphic Scene Manager with Flat Physics Geometry Cache
 *
 * Maintains high-level node instances (Emitter, Prism, Lens, BlackHole, Barrier)
 * and flattens boundary segments, arcs, and gravitational bodies into contiguous
 * arrays on dirty state updates for zero-allocation ray solver performance.
 */

import { type IVec2 } from '../math/vec2';
import { type Segment2D, type Arc2D } from '../geometry/intersections';
import { type BlackHole } from '../physics/rk2Integrator';
import { type CircleObstacle } from '../renderer/maskPass';
import { SceneNode } from './sceneNode';
import { EmitterNode } from './emitterNode';
import { BlackHoleNode } from './blackHoleNode';

export class SceneGraph {
  private nodes: SceneNode[] = [];
  private nodeMap: Map<string, SceneNode> = new Map();

  // Contiguous Flat Geometry Caches
  private cachedSegments: Segment2D[] = [];
  private cachedArcs: Arc2D[] = [];
  private cachedCorners: { x: number, y: number, elementId: number }[] = [];
  private cachedBlackHoles: BlackHole[] = [];
  private cachedObstaclePolygons: IVec2[][] = [];
  private cachedObstacleCircles: CircleObstacle[] = [];

  private isCacheDirty = true;

  constructor() {}

  addNode(node: SceneNode): void {
    if (this.nodeMap.has(node.id)) {
      this.removeNode(node.id);
    }
    this.nodes.push(node);
    this.nodeMap.set(node.id, node);
    this.isCacheDirty = true;
  }

  removeNode(id: string): boolean {
    const idx = this.nodes.findIndex(n => n.id === id);
    if (idx !== -1) {
      this.nodes.splice(idx, 1);
      this.nodeMap.delete(id);
      this.isCacheDirty = true;
      return true;
    }
    return false;
  }

  getNode(id: string): SceneNode | undefined {
    return this.nodeMap.get(id);
  }

  getAllNodes(): SceneNode[] {
    return this.nodes;
  }

  getEmitters(): EmitterNode[] {
    const emitters: EmitterNode[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i].type === 'emitter') {
        emitters.push(this.nodes[i] as EmitterNode);
      }
    }
    return emitters;
  }

  clear(): void {
    this.nodes.length = 0;
    this.nodeMap.clear();
    this.cachedSegments.length = 0;
    this.cachedArcs.length = 0;
    this.cachedCorners.length = 0;
    this.cachedBlackHoles.length = 0;
    this.cachedObstaclePolygons.length = 0;
    this.cachedObstacleCircles.length = 0;
    this.isCacheDirty = true;
  }

  isDirty(): boolean {
    if (this.isCacheDirty) return true;
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i].isDirty()) return true;
    }
    return false;
  }

  markDirty(): void {
    this.isCacheDirty = true;
  }

  updateFlatCache(): void {
    if (!this.isDirty()) {
      return;
    }

    this.cachedSegments = [];
    this.cachedArcs = [];
    this.cachedCorners = [];
    this.cachedBlackHoles = [];
    this.cachedObstaclePolygons = [];
    this.cachedObstacleCircles = [];

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];

      // Flatten Boundary Segments
      const segs = node.getBoundarySegments();
      for (let s = 0; s < segs.length; s++) {
        this.cachedSegments.push(segs[s]);
      }

      // Flatten Boundary Arcs
      const arcs = node.getBoundaryArcs();
      for (let a = 0; a < arcs.length; a++) {
        this.cachedArcs.push(arcs[a]);
      }

      // Flatten Corners
      const corners = node.getCorners();
      for (let c = 0; c < corners.length; c++) {
        this.cachedCorners.push(corners[c]);
      }

      // Flatten Black Holes
      if (node.type === 'black_hole') {
        this.cachedBlackHoles.push((node as BlackHoleNode).getBlackHoleStruct());
      }

      // Flatten Obstacle Mask Geometry
      const poly = node.getObstaclePolygon();
      if (poly && poly.length >= 3) {
        this.cachedObstaclePolygons.push(poly);
      }

      const circle = node.getObstacleCircle();
      if (circle) {
        this.cachedObstacleCircles.push(circle);
      }

      node.clearDirty();
    }

    this.isCacheDirty = false;
  }

  getCachedSegments(): Segment2D[] {
    return this.cachedSegments;
  }

  getCachedArcs(): Arc2D[] {
    return this.cachedArcs;
  }

  getCachedCorners() {
    return this.cachedCorners;
  }

  getCachedBlackHoles(): BlackHole[] {
    return this.cachedBlackHoles;
  }

  getCachedObstaclePolygons(): IVec2[][] {
    return this.cachedObstaclePolygons;
  }

  getCachedObstacleCircles(): CircleObstacle[] {
    return this.cachedObstacleCircles;
  }

  findNodeAt(worldPoint: IVec2): SceneNode | null {
    // Reverse iteration for top-to-bottom hit testing
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      if (node.containsPoint(worldPoint)) {
        return node;
      }
    }
    return null;
  }
}
