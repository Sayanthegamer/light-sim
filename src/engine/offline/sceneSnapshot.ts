/**
 * Scene Snapshot Freeze Protocol for Offline Web Worker Rendering
 *
 * Freezes live polymorphic SceneGraph instances into immutable transferable payloads
 * for multi-threaded background Monte Carlo path tracing.
 */

import { SceneGraph } from '../scene/sceneGraph';
import { EmitterNode } from '../scene/emitterNode';
import { PrismNode } from '../scene/prismNode';
import { LensNode } from '../scene/lensNode';
import { BarrierNode } from '../scene/barrierNode';
import { BlackHoleNode } from '../scene/blackHoleNode';
import {
  type IOfflineSceneGeometry,
  type IOfflineEmitter,
  type IOfflinePrism,
  type IOfflineLens,
  type IOfflineBarrier,
  type IOfflineBlackHole
} from './mcPhotonTracer';
import { createHomogeneousMedium } from './volumetricMedium';

export interface IOfflineRenderConfig {
  targetSamples: number;
  batchPhotons: number;
  maxBounces: number;
  russianRouletteThreshold: number;
  volumetricInScatter: boolean;
  whitePoint: number;
}

export interface IOfflineRenderJob {
  jobId: string;
  width: number;
  height: number;
  scene: IOfflineSceneGeometry;
  config: IOfflineRenderConfig;
}

export const DEFAULT_RENDER_CONFIG: IOfflineRenderConfig = {
  targetSamples: 1000,
  batchPhotons: 20000,
  maxBounces: 64,
  russianRouletteThreshold: 0.1,
  volumetricInScatter: true,
  whitePoint: 4.0
};

/**
 * Freezes a live SceneGraph into an immutable snapshot payload.
 */
export function freezeSceneSnapshot(
  sceneGraph: SceneGraph,
  width: number,
  height: number,
  config?: Partial<IOfflineRenderConfig>
): IOfflineRenderJob {
  const nodes = sceneGraph.getAllNodes();

  const emitters: IOfflineEmitter[] = [];
  const prisms: IOfflinePrism[] = [];
  const lenses: IOfflineLens[] = [];
  const barriers: IOfflineBarrier[] = [];
  const blackHoles: IOfflineBlackHole[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node instanceof EmitterNode) {
      const cos = Math.cos(node.rotation);
      const sin = Math.sin(node.rotation);
      emitters.push({
        id: Number(node.id) || i + 1,
        pos: { x: node.position.x, y: node.position.y },
        dir: { x: cos, y: sin },
        width: node.beamWidth,
        spectrumType: node.isWhiteLight ? 'd65' : 'monochromatic',
        spectrumParam: node.wavelength,
        power: node.intensity
      });
    } else if (node instanceof PrismNode) {
      prisms.push({
        id: Number(node.id) || i + 1,
        vertices: node.getObstaclePolygon(),
        n: node.refractiveIndex
      });
    } else if (node instanceof LensNode) {
      lenses.push({
        id: Number(node.id) || i + 1,
        arcs: node.getBoundaryArcs(),
        n: node.refractiveIndex
      });
    } else if (node instanceof BarrierNode) {
      const poly = node.getObstaclePolygon();
      if (poly.length >= 4) {
        // Use major centerline or 4 boundary segments
        barriers.push({
          id: Number(node.id) || i + 1,
          p1: poly[0],
          p2: poly[1],
          isMirror: node.isMirror
        });
        barriers.push({
          id: (Number(node.id) || i + 1) * 10 + 1,
          p1: poly[1],
          p2: poly[2],
          isMirror: node.isMirror
        });
        barriers.push({
          id: (Number(node.id) || i + 1) * 10 + 2,
          p1: poly[2],
          p2: poly[3],
          isMirror: node.isMirror
        });
        barriers.push({
          id: (Number(node.id) || i + 1) * 10 + 3,
          p1: poly[3],
          p2: poly[0],
          isMirror: node.isMirror
        });
      }
    } else if (node instanceof BlackHoleNode) {
      blackHoles.push({
        id: Number(node.id) || i + 1,
        center: { x: node.position.x, y: node.position.y },
        rs: node.rs,
        rInfluence: node.rInfluence
      });
    }
  }

  const mergedConfig: IOfflineRenderConfig = {
    ...DEFAULT_RENDER_CONFIG,
    ...config
  };

  const sceneGeometry: IOfflineSceneGeometry = {
    bounds: { minX: 0, minY: 0, maxX: width, maxY: height },
    emitters,
    prisms,
    lenses,
    barriers,
    blackHoles,
    medium: createHomogeneousMedium(0.0005, 0.002, 0.25, 'henyey-greenstein')
  };

  return {
    jobId: `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    width,
    height,
    scene: sceneGeometry,
    config: mergedConfig
  };
}

/**
 * Serializes the render job to JSON.
 */
export function serializeSceneSnapshot(job: IOfflineRenderJob): string {
  return JSON.stringify(job);
}

/**
 * Deserializes the render job from JSON.
 */
export function deserializeSceneSnapshot(json: string): IOfflineRenderJob {
  return JSON.parse(json) as IOfflineRenderJob;
}
