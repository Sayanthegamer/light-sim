/**
 * GizmoController: Smooth 2D On-Canvas Translation, Rotation, Resize, and Hover Gizmo Engine
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
  onHoverChange?: (hoveredNode: SceneNode | null, hoveredHandle: HandleType | null, cursor: string) => void;
}

export class GizmoController {
  private readonly scene: SceneGraph;
  private readonly hitTester: HitTester;
  private readonly options: GizmoControllerOptions;

  private selectedNodeId: string | null = null;
  private hoveredNodeId: string | null = null;
  private hoveredHandle: HandleType | null = null;
  private activeHandle: HandleType | null = null;
  private activeCursor = 'crosshair';
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

  getHoveredNode(): SceneNode | null {
    if (!this.hoveredNodeId) return null;
    return this.scene.getNode(this.hoveredNodeId) ?? null;
  }

  getHoveredNodeId(): string | null {
    return this.hoveredNodeId;
  }

  getHoveredHandle(): HandleType | null {
    return this.hoveredHandle;
  }

  getActiveHandle(): HandleType | null {
    return this.activeHandle;
  }

  getCursor(): string {
    return this.activeCursor;
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

  /**
   * Updates hover state and cursor feedback when moving the pointer without dragging.
   */
  onPointerHover(canvasX: number, canvasY: number): void {
    if (this.isDraggingFlag) return;

    const pointer: IVec2 = { x: canvasX, y: canvasY };
    const hitResult = this.hitTester.hitTest(this.scene, pointer, this.selectedNodeId);

    const nextHoverId = hitResult.hit && hitResult.node ? hitResult.node.id : null;
    const nextHandle = hitResult.hit ? hitResult.handleType : null;
    let nextCursor = 'crosshair';

    if (hitResult.hit) {
      if (hitResult.handle?.cursor) {
        nextCursor = hitResult.handle.cursor;
      } else if (hitResult.handleType === HandleType.Body) {
        nextCursor = 'move';
      }
    }

    if (
      nextHoverId !== this.hoveredNodeId ||
      nextHandle !== this.hoveredHandle ||
      nextCursor !== this.activeCursor
    ) {
      this.hoveredNodeId = nextHoverId;
      this.hoveredHandle = nextHandle;
      this.activeCursor = nextCursor;
      this.options.onHoverChange?.(this.getHoveredNode(), this.hoveredHandle, this.activeCursor);
    }
  }

  onPointerDown(canvasX: number, canvasY: number): boolean {
    const pointer: IVec2 = { x: canvasX, y: canvasY };
    const hitResult = this.hitTester.hitTest(this.scene, pointer, this.selectedNodeId);

    if (hitResult.hit && hitResult.node) {
      this.selectedNodeId = hitResult.node.id;
      this.hoveredNodeId = hitResult.node.id;
      this.activeHandle = hitResult.handleType;
      this.hoveredHandle = hitResult.handleType;
      this.isDraggingFlag = true;
      this.activeCursor = hitResult.handleType === HandleType.Rotate ? 'grabbing' : 'move';

      this.dragStartPointer = { x: canvasX, y: canvasY };
      this.dragStartNodePos = { x: hitResult.node.position.x, y: hitResult.node.position.y };

      this.options.onInteractionStart?.();
      this.options.onInteractionUpdate?.();
      this.options.onHoverChange?.(hitResult.node, this.hoveredHandle, this.activeCursor);
      return true;
    }

    // Clicked empty canvas space -> deselect
    if (this.selectedNodeId !== null) {
      this.selectedNodeId = null;
      this.options.onInteractionUpdate?.();
    }

    return false;
  }

  onPointerMove(canvasX: number, canvasY: number, shiftKey = false): boolean {
    if (!this.isDraggingFlag || !this.selectedNodeId) {
      this.onPointerHover(canvasX, canvasY);
      return false;
    }

    const node = this.scene.getNode(this.selectedNodeId);
    if (!node) return false;

    const dx = canvasX - this.dragStartPointer.x;
    const dy = canvasY - this.dragStartPointer.y;

    if (this.activeHandle === HandleType.Body) {
      // Translation (with optional Shift-key 10px grid snap)
      let nx = this.dragStartNodePos.x + dx;
      let ny = this.dragStartNodePos.y + dy;
      if (shiftKey) {
        nx = Math.round(nx / 10) * 10;
        ny = Math.round(ny / 10) * 10;
      }
      node.setPosition(nx, ny);
    } else if (this.activeHandle === HandleType.Rotate) {
      // Rotation (with optional Shift-key 15-degree angle snap)
      let currentAngle = Math.atan2(canvasY - node.position.y, canvasX - node.position.x);
      if (shiftKey) {
        const snapRad = Math.PI / 12; // 15 degrees
        currentAngle = Math.round(currentAngle / snapRad) * snapRad;
      }
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
      this.activeCursor = this.hoveredNodeId ? 'move' : 'crosshair';
      this.options.onInteractionCommit?.();
      this.options.onHoverChange?.(this.getHoveredNode(), this.hoveredHandle, this.activeCursor);
      return true;
    }
    return false;
  }
}
