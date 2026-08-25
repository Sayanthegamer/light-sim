/**
 * PrismNode: Polygonal Dispersive Optical Element
 */

import { type IVec2 } from '../math/vec2';
import { type Segment2D, type Arc2D } from '../geometry/intersections';
import { type CircleObstacle } from '../renderer/maskPass';
import { SceneNode, DirtyFlag, hashString } from './sceneNode';

export interface PrismOptions {
  vertices?: IVec2[];
  refractiveIndex?: number;
  cauchyA?: number;
  cauchyB?: number;
  isDispersive?: boolean;
}

export class PrismNode extends SceneNode {
  vertices: IVec2[];
  refractiveIndex: number;
  cauchyA: number;
  cauchyB: number;
  isDispersive: boolean;

  constructor(id: string, position: IVec2, rotation = 0, options?: PrismOptions) {
    super(id, 'prism', position, rotation);
    // Default equilateral triangle prism (side = 80px)
    this.vertices = options?.vertices ?? [
      { x: -40, y: -35 },
      { x: 40, y: -35 },
      { x: 0, y: 35 }
    ];
    this.refractiveIndex = options?.refractiveIndex ?? 1.517; // Crown Glass
    this.cauchyA = options?.cauchyA ?? 1.5046;
    this.cauchyB = options?.cauchyB ?? 4200;
    this.isDispersive = options?.isDispersive ?? true;
    this.updateBoundingRadius();
  }

  private updateBoundingRadius(): void {
    let maxR = 0;
    for (let i = 0; i < this.vertices.length; i++) {
      const v = this.vertices[i];
      const r = Math.sqrt(v.x * v.x + v.y * v.y);
      if (r > maxR) maxR = r;
    }
    this.boundingRadius = maxR + 5;
  }

  setRefractiveIndex(n: number): void {
    if (this.refractiveIndex !== n) {
      this.refractiveIndex = n;
      this.markDirty(DirtyFlag.Param);
    }
  }

  setCauchy(a: number, b: number): void {
    if (this.cauchyA !== a || this.cauchyB !== b) {
      this.cauchyA = a;
      this.cauchyB = b;
      this.markDirty(DirtyFlag.Param);
    }
  }

  setVertices(vertices: IVec2[]): void {
    this.vertices = vertices;
    this.updateBoundingRadius();
    this.markDirty(DirtyFlag.Transform);
  }

  getObstaclePolygon(): IVec2[] {
    const worldVerts: IVec2[] = [];
    for (let i = 0; i < this.vertices.length; i++) {
      worldVerts.push(this.localToWorld(this.vertices[i]));
    }
    return worldVerts;
  }

  getBoundarySegments(): Segment2D[] {
    const worldVerts = this.getObstaclePolygon();
    const segments: Segment2D[] = [];
    const n = worldVerts.length;
    const baseId = hashString(this.id) % 1000000;

    for (let i = 0; i < n; i++) {
      const p1 = worldVerts[i];
      const p2 = worldVerts[(i + 1) % n];

      segments.push({
        id: baseId + i,
        p1,
        p2,
        n1: 1.0,
        n2: this.refractiveIndex,
        cauchyA: this.isDispersive ? this.cauchyA : undefined,
        cauchyB: this.isDispersive ? this.cauchyB : undefined
      });
    }

    return segments;
  }

  getBoundaryArcs(): Arc2D[] {
    return [];
  }

  getCorners() {
    const worldVerts = this.getObstaclePolygon();
    const corners = [];
    const n = worldVerts.length;
    const baseId = hashString(this.id) % 1000000;
    
    for (let i = 0; i < n; i++) {
      corners.push({
        x: worldVerts[i].x,
        y: worldVerts[i].y,
        elementId: baseId + i
      });
    }
    return corners;
  }

  getObstacleCircle(): CircleObstacle | null {
    return null;
  }

  containsPoint(worldPoint: IVec2): boolean {
    const poly = this.getObstaclePolygon();
    let inside = false;
    const x = worldPoint.x;
    const y = worldPoint.y;

    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;

      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }

    return inside;
  }
}
