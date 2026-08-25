/**
 * LensNode: Analytic Spherical / Curved Refractive Lens Element
 */

import { type IVec2 } from '../math/vec2';
import { type Segment2D, type Arc2D } from '../geometry/intersections';
import { type CircleObstacle } from '../renderer/maskPass';
import { SceneNode, DirtyFlag } from './sceneNode';

export enum LensType {
  Biconvex = 'biconvex',
  Biconcave = 'biconcave',
  Planoconvex = 'planoconvex',
  Planoconcave = 'planoconcave'
}

export interface LensOptions {
  lensType?: LensType;
  radius1?: number; // Curvature radius of surface 1 (px)
  radius2?: number; // Curvature radius of surface 2 (px)
  height?: number;  // Full aperture height (px)
  thickness?: number; // Center thickness (px)
  refractiveIndex?: number;
  cauchyA?: number;
  cauchyB?: number;
}

export class LensNode extends SceneNode {
  lensType: LensType;
  radius1: number;
  radius2: number;
  height: number;
  thickness: number;
  refractiveIndex: number;
  cauchyA: number;
  cauchyB: number;

  constructor(id: string, position: IVec2, rotation = 0, options?: LensOptions) {
    super(id, 'lens', position, rotation);
    this.lensType = options?.lensType ?? LensType.Biconvex;
    this.radius1 = options?.radius1 ?? 80;
    this.radius2 = options?.radius2 ?? 80;
    this.height = options?.height ?? 60;
    this.thickness = options?.thickness ?? 20;
    this.refractiveIndex = options?.refractiveIndex ?? 1.52;
    this.cauchyA = options?.cauchyA ?? 1.5046;
    this.cauchyB = options?.cauchyB ?? 4200;
    this.boundingRadius = Math.max(this.height * 0.6, this.thickness * 0.6) + 10;
  }

  setRefractiveIndex(n: number): void {
    if (this.refractiveIndex !== n) {
      this.refractiveIndex = n;
      this.markDirty(DirtyFlag.Param);
    }
  }

  setCurvature(r1: number, r2: number): void {
    if (this.radius1 !== r1 || this.radius2 !== r2) {
      this.radius1 = r1;
      this.radius2 = r2;
      this.markDirty(DirtyFlag.Param);
    }
  }

  setAperture(height: number, thickness: number): void {
    if (this.height !== height || this.thickness !== thickness) {
      this.height = height;
      this.thickness = thickness;
      this.boundingRadius = Math.max(this.height * 0.6, this.thickness * 0.6) + 10;
      this.markDirty(DirtyFlag.Param);
    }
  }

  getBoundaryArcs(): Arc2D[] {
    const arcs: Arc2D[] = [];
    const hHalf = this.height * 0.5;

    if (this.lensType === LensType.Biconvex) {
      // Surface 1 (Left): Center is to the right at (+cx, 0)
      const r1 = Math.max(this.radius1, hHalf + 1);
      const cx1 = Math.sqrt(Math.max(0, r1 * r1 - hHalf * hHalf)) - this.thickness * 0.5;
      const angleHalf1 = Math.asin(Math.min(1.0, hHalf / r1));

      // Surface 2 (Right): Center is to the left at (-cx, 0)
      const r2 = Math.max(this.radius2, hHalf + 1);
      const cx2 = -(Math.sqrt(Math.max(0, r2 * r2 - hHalf * hHalf)) - this.thickness * 0.5);
      const angleHalf2 = Math.asin(Math.min(1.0, hHalf / r2));

      // Transform centers to world space
      const worldCenter1 = this.localToWorld({ x: cx1, y: 0 });
      const worldCenter2 = this.localToWorld({ x: cx2, y: 0 });

      // Arc 1 (Left surface): angles around Math.PI
      arcs.push({
        id: (this.id.charCodeAt(0) * 100 + 1) % 100000,
        center: worldCenter1,
        radius: r1,
        startAngle: Math.PI - angleHalf1 + this.rotation,
        endAngle: Math.PI + angleHalf1 + this.rotation,
        nInside: this.refractiveIndex,
        nOutside: 1.0,
        cauchyA: this.cauchyA,
        cauchyB: this.cauchyB
      });

      // Arc 2 (Right surface): angles around 0
      arcs.push({
        id: (this.id.charCodeAt(0) * 100 + 2) % 100000,
        center: worldCenter2,
        radius: r2,
        startAngle: -angleHalf2 + this.rotation,
        endAngle: angleHalf2 + this.rotation,
        nInside: this.refractiveIndex,
        nOutside: 1.0,
        cauchyA: this.cauchyA,
        cauchyB: this.cauchyB
      });
    } else {
      // Planoconvex or generic
      const r1 = Math.max(this.radius1, hHalf + 1);
      const cx1 = -(Math.sqrt(Math.max(0, r1 * r1 - hHalf * hHalf)) - this.thickness * 0.5);
      const angleHalf1 = Math.asin(Math.min(1.0, hHalf / r1));
      const worldCenter1 = this.localToWorld({ x: cx1, y: 0 });

      arcs.push({
        id: (this.id.charCodeAt(0) * 100 + 1) % 100000,
        center: worldCenter1,
        radius: r1,
        startAngle: -angleHalf1 + this.rotation,
        endAngle: angleHalf1 + this.rotation,
        nInside: this.refractiveIndex,
        nOutside: 1.0,
        cauchyA: this.cauchyA,
        cauchyB: this.cauchyB
      });
    }

    return arcs;
  }

  getBoundarySegments(): Segment2D[] {
    const segments: Segment2D[] = [];
    const hHalf = this.height * 0.5;

    if (this.lensType === LensType.Planoconvex || this.lensType === LensType.Planoconcave) {
      // Flat back face
      const p1 = this.localToWorld({ x: -this.thickness * 0.5, y: -hHalf });
      const p2 = this.localToWorld({ x: -this.thickness * 0.5, y: hHalf });
      segments.push({
        id: (this.id.charCodeAt(0) * 100 + 3) % 100000,
        p1,
        p2,
        n1: 1.0,
        n2: this.refractiveIndex,
        cauchyA: this.cauchyA,
        cauchyB: this.cauchyB
      });
    }

    return segments;
  }

  getObstaclePolygon(): IVec2[] {
    // Tessellate lens boundary into polygon for R8 mask pass
    const verts: IVec2[] = [];
    const steps = 16;
    const hHalf = this.height * 0.5;
    const r1 = Math.max(this.radius1, hHalf + 1);
    const r2 = Math.max(this.radius2, hHalf + 1);

    const cx1 = Math.sqrt(Math.max(0, r1 * r1 - hHalf * hHalf)) - this.thickness * 0.5;
    const angleHalf1 = Math.asin(Math.min(1.0, hHalf / r1));
    const cx2 = -(Math.sqrt(Math.max(0, r2 * r2 - hHalf * hHalf)) - this.thickness * 0.5);
    const angleHalf2 = Math.asin(Math.min(1.0, hHalf / r2));

    // Left arc: top to bottom
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = (Math.PI - angleHalf1) + (2.0 * angleHalf1) * t;
      const lx = cx1 + r1 * Math.cos(angle);
      const ly = r1 * Math.sin(angle);
      verts.push(this.localToWorld({ x: lx, y: ly }));
    }

    // Right arc: bottom to top
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = angleHalf2 - (2.0 * angleHalf2) * t;
      const lx = cx2 + r2 * Math.cos(angle);
      const ly = r2 * Math.sin(angle);
      verts.push(this.localToWorld({ x: lx, y: ly }));
    }

    return verts;
  }

  getObstacleCircle(): CircleObstacle | null {
    return null;
  }

  containsPoint(worldPoint: IVec2): boolean {
    const local = this.worldToLocal(worldPoint);
    const halfH = this.height * 0.5;
    const halfT = this.thickness * 0.5 + 4;
    return Math.abs(local.x) <= halfT && Math.abs(local.y) <= halfH;
  }
}
