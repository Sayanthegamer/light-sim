/**
 * EmitterNode: Directional Spectral Light Source
 */

import { type IVec2 } from '../math/vec2';
import { type Ray2D, type Segment2D, type Arc2D } from '../geometry/intersections';
import { type CircleObstacle } from '../renderer/maskPass';
import { SceneNode, DirtyFlag } from './sceneNode';

export interface EmitterOptions {
  beamWidth?: number;
  intensity?: number;
  wavelength?: number; // nm, e.g. 532
  isWhiteLight?: boolean;
  spectralSamples?: number;
}

export class EmitterNode extends SceneNode {
  beamWidth: number;
  intensity: number;
  wavelength: number;
  isWhiteLight: boolean;
  spectralSamples: number;

  constructor(id: string, position: IVec2, rotation = 0, options?: EmitterOptions) {
    super(id, 'emitter', position, rotation);
    this.beamWidth = options?.beamWidth ?? 40;
    this.intensity = options?.intensity ?? 1.0;
    this.wavelength = options?.wavelength ?? 550;
    this.isWhiteLight = options?.isWhiteLight ?? false;
    this.spectralSamples = options?.spectralSamples ?? 16;
    this.boundingRadius = Math.max(25, this.beamWidth * 0.6);
  }

  setBeamWidth(width: number): void {
    if (this.beamWidth !== width) {
      this.beamWidth = width;
      this.boundingRadius = Math.max(25, this.beamWidth * 0.6);
      this.markDirty(DirtyFlag.Param);
    }
  }

  setIntensity(intensity: number): void {
    if (this.intensity !== intensity) {
      this.intensity = intensity;
      this.markDirty(DirtyFlag.Param);
    }
  }

  setWavelength(wavelength: number): void {
    if (this.wavelength !== wavelength) {
      this.wavelength = wavelength;
      this.markDirty(DirtyFlag.Param);
    }
  }

  setIsWhiteLight(isWhiteLight: boolean): void {
    if (this.isWhiteLight !== isWhiteLight) {
      this.isWhiteLight = isWhiteLight;
      this.markDirty(DirtyFlag.Param);
    }
  }

  generateInitialRays(): { leftRay: Ray2D; rightRay: Ray2D } {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const dir = { x: cos, y: sin };

    // Perpendicular normal: (-sin, cos)
    const halfW = this.beamWidth * 0.5;
    const nx = -sin;
    const ny = cos;

    const leftOrigin: IVec2 = {
      x: this.position.x - nx * halfW,
      y: this.position.y - ny * halfW
    };

    const rightOrigin: IVec2 = {
      x: this.position.x + nx * halfW,
      y: this.position.y + ny * halfW
    };

    return {
      leftRay: { origin: leftOrigin, dir },
      rightRay: { origin: rightOrigin, dir }
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

  getObstacleCircle(): CircleObstacle | null {
    return null;
  }

  containsPoint(worldPoint: IVec2): boolean {
    const local = this.worldToLocal(worldPoint);
    // Emitter body is a small box behind the aperture: [-20, 0] in x, [-halfW, halfW] in y
    const halfW = this.beamWidth * 0.5 + 8;
    return local.x >= -24 && local.x <= 8 && local.y >= -halfW && local.y <= halfW;
  }
}
