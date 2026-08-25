/**
 * HitTester: Direct 2D Canvas Vector Raycaster & Gizmo Handle Hit-Testing
 */

import { type IVec2 } from '../math/vec2';
import { SceneGraph } from '../scene/sceneGraph';
import { SceneNode } from '../scene/sceneNode';
import { EmitterNode } from '../scene/emitterNode';
import { BlackHoleNode } from '../scene/blackHoleNode';
import { LensNode } from '../scene/lensNode';
import { BarrierNode } from '../scene/barrierNode';

export enum HandleType {
  Body = 'body',
  Rotate = 'rotate',
  ResizePrimary = 'resize_primary',
  ResizeSecondary = 'resize_secondary'
}

export interface GizmoHandle {
  type: HandleType;
  position: IVec2;
  radius: number;
  cursor: string;
}

export interface HitTestResult {
  hit: boolean;
  node: SceneNode | null;
  handleType: HandleType | null;
  handle?: GizmoHandle;
}

export class HitTester {
  private readonly defaultHandleRadius = 10;

  getRotationHandle(node: SceneNode): GizmoHandle {
    const dist = Math.max(node.boundingRadius + 24, 45);
    const cos = Math.cos(node.rotation);
    const sin = Math.sin(node.rotation);

    return {
      type: HandleType.Rotate,
      position: {
        x: node.position.x + cos * dist,
        y: node.position.y + sin * dist
      },
      radius: this.defaultHandleRadius,
      cursor: 'grab'
    };
  }

  getGizmoHandles(node: SceneNode): GizmoHandle[] {
    const handles: GizmoHandle[] = [this.getRotationHandle(node)];

    if (node.type === 'emitter') {
      const emitter = node as EmitterNode;
      const halfW = emitter.beamWidth * 0.5;
      const cos = Math.cos(node.rotation);
      const sin = Math.sin(node.rotation);
      const nx = -sin;
      const ny = cos;

      handles.push({
        type: HandleType.ResizePrimary,
        position: {
          x: node.position.x + nx * halfW,
          y: node.position.y + ny * halfW
        },
        radius: this.defaultHandleRadius,
        cursor: 'ew-resize'
      });

      handles.push({
        type: HandleType.ResizeSecondary,
        position: {
          x: node.position.x - nx * halfW,
          y: node.position.y - ny * halfW
        },
        radius: this.defaultHandleRadius,
        cursor: 'ew-resize'
      });
    } else if (node.type === 'black_hole') {
      const bh = node as BlackHoleNode;
      handles.push({
        type: HandleType.ResizePrimary,
        position: {
          x: node.position.x + bh.rs,
          y: node.position.y
        },
        radius: this.defaultHandleRadius,
        cursor: 'ew-resize'
      });
    } else if (node.type === 'barrier') {
      const bar = node as BarrierNode;
      const halfL = bar.length * 0.5;
      const cos = Math.cos(node.rotation);
      const sin = Math.sin(node.rotation);
      const nx = -sin;
      const ny = cos;

      handles.push({
        type: HandleType.ResizePrimary,
        position: {
          x: node.position.x + nx * halfL,
          y: node.position.y + ny * halfL
        },
        radius: this.defaultHandleRadius,
        cursor: 'ns-resize'
      });
    } else if (node.type === 'lens') {
      const lens = node as LensNode;
      const halfH = lens.height * 0.5;
      const cos = Math.cos(node.rotation);
      const sin = Math.sin(node.rotation);
      const nx = -sin;
      const ny = cos;

      handles.push({
        type: HandleType.ResizePrimary,
        position: {
          x: node.position.x + nx * halfH,
          y: node.position.y + ny * halfH
        },
        radius: this.defaultHandleRadius,
        cursor: 'ns-resize'
      });
    }

    return handles;
  }

  hitTest(
    scene: SceneGraph,
    worldPoint: IVec2,
    selectedNodeId?: string | null
  ): HitTestResult {
    // 1. Check gizmo handles of selected node first (highest priority)
    if (selectedNodeId) {
      const selected = scene.getNode(selectedNodeId);
      if (selected) {
        const handles = this.getGizmoHandles(selected);
        for (let i = 0; i < handles.length; i++) {
          const h = handles[i];
          const dx = worldPoint.x - h.position.x;
          const dy = worldPoint.y - h.position.y;
          const hitRadius = h.radius + 4;
          if (dx * dx + dy * dy <= hitRadius * hitRadius) {
            return {
              hit: true,
              node: selected,
              handleType: h.type,
              handle: h
            };
          }
        }
      }
    }

    // 2. Check scene node bodies
    const hitNode = scene.findNodeAt(worldPoint);
    if (hitNode) {
      return {
        hit: true,
        node: hitNode,
        handleType: HandleType.Body
      };
    }

    return {
      hit: false,
      node: null,
      handleType: null
    };
  }
}
