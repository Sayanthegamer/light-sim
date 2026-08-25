/**
 * BarrierNode: Opaque Optical Absorber or Planar Mirror
 */

import { type IVec2 } from '../math/vec2';
import { type Segment2D, type Arc2D } from '../geometry/intersections';
import { type CircleObstacle } from '../renderer/maskPass';
import { SceneNode, DirtyFlag, hashString } from './sceneNode';

export interface BarrierOptions {
  length?: number;
  thickness?: number;
  isMirror?: boolean;
}

export class BarrierNode extends SceneNode {
  length: number;
  thickness: number;
  isMirror: boolean;

  constructor(id: string, position: IVec2, rotation = 0, options?: BarrierOptions) {
    super(id, 'barrier', position, rotation);
    this.length = options?.length ?? 120;
    this.thickness = options?.thickness ?? 6;
    this.isMirror = options?.isMirror ?? false;
    this.boundingRadius = Math.max(this.length * 0.6, this.thickness * 0.6);
  }

  setIsMirror(isMirror: boolean): void {
    if (this.isMirror !== isMirror) {
      this.isMirror = isMirror;
      this.markDirty(DirtyFlag.Param);
    }
  }

  setDimensions(length: number, thickness: number): void {
    if (this.length !== length || this.thickness !== thickness) {
      this.length = length;
      this.thickness = thickness;
      this.boundingRadius = Math.max(this.length * 0.6, this.thickness * 0.6);
      this.markDirty(DirtyFlag.Param);
    }
  }

  getObstaclePolygon(): IVec2[] {
    const halfL = this.length * 0.5;
    const halfT = this.thickness * 0.5;

    return [
      this.localToWorld({ x: -halfT, y: -halfL }),
      this.localToWorld({ x: halfT, y: -halfL }),
      this.localToWorld({ x: halfT, y: halfL }),
      this.localToWorld({ x: -halfT, y: halfL })
    ];
  }

  getBoundarySegments(): Segment2D[] {
    const poly = this.getObstaclePolygon();
    const segments: Segment2D[] = [];
    const baseId = hashString(this.id) % 1000000;

    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      segments.push({
        id: baseId + i,
        p1,
        p2,
        n1: 1.0,
        n2: 1.0,
        isBarrier: !this.isMirror,
        isMirror: this.isMirror
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
    const local = this.worldToLocal(worldPoint);
    const halfL = this.length * 0.5 + 4;
    const halfT = this.thickness * 0.5 + 4;
    return Math.abs(local.x) <= halfT && Math.abs(local.y) <= halfL;
  }
}
