/**
 * GizmoController: Smooth 2D On-Canvas Translation, Rotation, and Resize Gizmo Engine
 */

import { type IVec2 } from '../math/vec2';
import { SceneGraph } from '../scene/sceneGraph';
import { SceneNode } from '../scene/sceneNode';
import { EmitterNode } from '../scene/emitterNode';
import { BlackHoleNode } from '../scene/blackHoleNode';
import { LensNode } from '../scene/lensNode';
import { BarrierNode } from '../scene/barrierNode';
import { HitTester, HandleType, type GizmoHandle } from './hitTester';

export interface GizmoControllerOptions {
  onInteractionStart?: () => void;
  onInteractionUpdate?: () => void;
  onInteractionCommit?: () => void;
}

export class GizmoController {
  private readonly scene: SceneGraph;
  private readonly hitTester: HitTester;
  private readonly options: GizmoControllerOptions;

  private selectedNodeId: string | null = null;
  private activeHandle: HandleType | null = null;
  private isDraggingFlag = false;

  // Drag start state caches
  private dragStartPointer: IVec2 = { x: 0, y: 0 };
  private dragStartNodePos: IVec2 = { x: 0, y: 0 };

  constructor(scene: SceneGraph, options?: GizmoControllerOptions) {
    this.scene = scene;
    this.hitTester = new HitTester();
    this.options = options ?? {};
  }

  getSelectedNode(): SceneNode | null {
    if (!this.selectedNodeId) return null;
    return this.scene.getNode(this.selectedNodeId) ?? null;
  }

  getSelectedNodeId(): string | null {
    return this.selectedNodeId;
  }

  selectNode(id: string | null): void {
    if (this.selectedNodeId !== id) {
      this.selectedNodeId = id;
      this.options.onInteractionUpdate?.();
    }
  }

  isDragging(): boolean {
    return this.isDraggingFlag;
  }

  getGizmoHandles(): GizmoHandle[] {
    const selected = this.getSelectedNode();
    if (!selected) return [];
    return this.hitTester.getGizmoHandles(selected);
  }

  onPointerDown(canvasX: number, canvasY: number): boolean {
    const pointer: IVec2 = { x: canvasX, y: canvasY };
    const hitResult = this.hitTester.hitTest(this.scene, pointer, this.selectedNodeId);

    if (hitResult.hit && hitResult.node) {
      this.selectedNodeId = hitResult.node.id;
      this.activeHandle = hitResult.handleType;
      this.isDraggingFlag = true;

      this.dragStartPointer = { x: canvasX, y: canvasY };
      this.dragStartNodePos = { x: hitResult.node.position.x, y: hitResult.node.position.y };

      this.options.onInteractionStart?.();
      this.options.onInteractionUpdate?.();
      return true;
    }

    // Clicked empty canvas space -> deselect
    if (this.selectedNodeId !== null) {
      this.selectedNodeId = null;
      this.options.onInteractionUpdate?.();
    }

    return false;
  }

  onPointerMove(canvasX: number, canvasY: number): boolean {
    if (!this.isDraggingFlag || !this.selectedNodeId) {
      return false;
    }

    const node = this.scene.getNode(this.selectedNodeId);
    if (!node) return false;

    const dx = canvasX - this.dragStartPointer.x;
    const dy = canvasY - this.dragStartPointer.y;

    if (this.activeHandle === HandleType.Body) {
      // Translation
      node.setPosition(this.dragStartNodePos.x + dx, this.dragStartNodePos.y + dy);
    } else if (this.activeHandle === HandleType.Rotate) {
      // Rotation
      const currentAngle = Math.atan2(canvasY - node.position.y, canvasX - node.position.x);
      node.setRotation(currentAngle);
    } else if (
      this.activeHandle === HandleType.ResizePrimary ||
      this.activeHandle === HandleType.ResizeSecondary
    ) {
      // Sizing
      const distToCenter = Math.sqrt(
        (canvasX - node.position.x) * (canvasX - node.position.x) +
        (canvasY - node.position.y) * (canvasY - node.position.y)
      );

      if (node.type === 'emitter') {
        (node as EmitterNode).setBeamWidth(Math.max(10, Math.min(300, distToCenter * 2)));
      } else if (node.type === 'black_hole') {
        (node as BlackHoleNode).setRs(Math.max(5, Math.min(150, distToCenter)));
      } else if (node.type === 'barrier') {
        (node as BarrierNode).setDimensions(Math.max(20, Math.min(600, distToCenter * 2)), (node as BarrierNode).thickness);
      } else if (node.type === 'lens') {
        (node as LensNode).setAperture(Math.max(20, Math.min(400, distToCenter * 2)), (node as LensNode).thickness);
      }
    }

    this.options.onInteractionUpdate?.();
    return true;
  }

  onPointerUp(): boolean {
    if (this.isDraggingFlag) {
      this.isDraggingFlag = false;
      this.activeHandle = null;
      this.options.onInteractionCommit?.();
      return true;
    }
    return false;
  }
}
