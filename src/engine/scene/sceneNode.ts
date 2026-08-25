/**
 * SceneNode Base Class & Dirty Flag State Machine
 */

import { type IVec2 } from '../math/vec2';
import { type Segment2D, type Arc2D } from '../geometry/intersections';
import { type CircleObstacle } from '../renderer/maskPass';

export enum DirtyFlag {
  None = 0,
  Transform = 1 << 0,
  Param = 1 << 1,
  All = (1 << 0) | (1 << 1)
}

export type NodeType = 'emitter' | 'prism' | 'lens' | 'black_hole' | 'barrier';

export abstract class SceneNode {
  readonly id: string;
  readonly type: NodeType;
  position: IVec2;
  rotation: number; // in radians
  dirtyFlags: number = DirtyFlag.All;
  boundingRadius = 50;

  constructor(id: string, type: NodeType, position: IVec2, rotation = 0) {
    this.id = id;
    this.type = type;
    this.position = { x: position.x, y: position.y };
    this.rotation = rotation;
  }

  isDirty(): boolean {
    return this.dirtyFlags !== DirtyFlag.None;
  }

  markDirty(flag: DirtyFlag = DirtyFlag.All): void {
    this.dirtyFlags |= flag;
  }

  clearDirty(): void {
    this.dirtyFlags = DirtyFlag.None;
  }

  setPosition(x: number, y: number): void {
    if (this.position.x !== x || this.position.y !== y) {
      this.position.x = x;
      this.position.y = y;
      this.markDirty(DirtyFlag.Transform);
    }
  }

  setRotation(angle: number): void {
    if (this.rotation !== angle) {
      this.rotation = angle;
      this.markDirty(DirtyFlag.Transform);
    }
  }

  localToWorld(local: IVec2): IVec2 {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return {
      x: this.position.x + local.x * cos - local.y * sin,
      y: this.position.y + local.x * sin + local.y * cos
    };
  }

  worldToLocal(world: IVec2): IVec2 {
    const dx = world.x - this.position.x;
    const dy = world.y - this.position.y;
    const cos = Math.cos(-this.rotation);
    const sin = Math.sin(-this.rotation);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos
    };
  }

  abstract getBoundarySegments(): Segment2D[];
  abstract getBoundaryArcs(): Arc2D[];
  abstract getObstaclePolygon(): IVec2[];
  abstract getObstacleCircle(): CircleObstacle | null;
  abstract containsPoint(worldPoint: IVec2): boolean;

  getCorners(): { x: number, y: number, elementId: number }[] {
    return [];
  }
}
