/**
 * BlackHoleNode: Schwarzschild Relativistic Gravity Center
 */

import { type IVec2 } from '../math/vec2';
import { type Segment2D, type Arc2D } from '../geometry/intersections';
import { type BlackHole } from '../physics/rk2Integrator';
import { type CircleObstacle } from '../renderer/maskPass';
import { SceneNode, DirtyFlag } from './sceneNode';

export interface BlackHoleOptions {
  rs?: number; // Schwarzschild radius (px)
}

export class BlackHoleNode extends SceneNode {
  rs: number;
  rInfluence: number;

  constructor(id: string, position: IVec2, rotation = 0, options?: BlackHoleOptions) {
    super(id, 'black_hole', position, rotation);
    this.rs = options?.rs ?? 20;
    this.rInfluence = this.rs * 12;
    this.boundingRadius = this.rInfluence;
  }

  setRs(rs: number): void {
    if (this.rs !== rs) {
      this.rs = rs;
      this.rInfluence = rs * 12;
      this.boundingRadius = this.rInfluence;
      this.markDirty(DirtyFlag.Param);
    }
  }

  getBlackHoleStruct(): BlackHole {
    return {
      id: (this.id.charCodeAt(0) * 100) % 100000,
      center: { x: this.position.x, y: this.position.y },
      rs: this.rs,
      rInfluence: this.rInfluence
    };
  }

  getObstacleCircle(): CircleObstacle {
    return {
      center: { x: this.position.x, y: this.position.y },
      radius: this.rs
    };
  }

  getBoundarySegments(): Segment2D[] {
    return [];
  }

  getBoundaryArcs(): Arc2D[] {
    return [];
  }

  getObstaclePolygon(): IVec2[] {
    return [];
  }

  containsPoint(worldPoint: IVec2): boolean {
    const dx = worldPoint.x - this.position.x;
    const dy = worldPoint.y - this.position.y;
    return (dx * dx + dy * dy) <= (this.rs * this.rs);
  }
}
