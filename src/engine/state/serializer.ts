/**
 * Canonical JSON Serialization & LZ-String URL Compression Engine
 */

import LZString from 'lz-string';
import { SceneGraph } from '../scene/sceneGraph';
import { SceneNode, NodeType } from '../scene/sceneNode';
import { EmitterNode, type EmitterOptions } from '../scene/emitterNode';
import { PrismNode, type PrismOptions } from '../scene/prismNode';
import { LensNode, type LensOptions } from '../scene/lensNode';
import { BlackHoleNode, type BlackHoleOptions } from '../scene/blackHoleNode';
import { BarrierNode, type BarrierOptions } from '../scene/barrierNode';

export interface SerializedNodeData {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  rotation: number;
  params?: Record<string, unknown>;
}

export interface SerializedScene {
  version: number;
  name?: string;
  description?: string;
  nodes: SerializedNodeData[];
}

export const SCHEMA_VERSION = 1;

export function serializeScene(
  scene: SceneGraph,
  metadata?: { name?: string; description?: string }
): SerializedScene {
  const nodes = scene.getAllNodes();
  const serializedNodes: SerializedNodeData[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const data: SerializedNodeData = {
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      rotation: node.rotation
    };

    if (node.type === 'emitter') {
      const e = node as EmitterNode;
      data.params = {
        beamWidth: e.beamWidth,
        intensity: e.intensity,
        wavelength: e.wavelength,
        isWhiteLight: e.isWhiteLight,
        spectralSamples: e.spectralSamples
      };
    } else if (node.type === 'prism') {
      const p = node as PrismNode;
      data.params = {
        vertices: p.vertices,
        refractiveIndex: p.refractiveIndex,
        cauchyA: p.cauchyA,
        cauchyB: p.cauchyB,
        isDispersive: p.isDispersive
      };
    } else if (node.type === 'lens') {
      const l = node as LensNode;
      data.params = {
        lensType: l.lensType,
        radius1: l.radius1,
        radius2: l.radius2,
        height: l.height,
        thickness: l.thickness,
        refractiveIndex: l.refractiveIndex,
        cauchyA: l.cauchyA,
        cauchyB: l.cauchyB
      };
    } else if (node.type === 'black_hole') {
      const bh = node as BlackHoleNode;
      data.params = {
        rs: bh.rs
      };
    } else if (node.type === 'barrier') {
      const b = node as BarrierNode;
      data.params = {
        length: b.length,
        thickness: b.thickness,
        isMirror: b.isMirror
      };
    }

    serializedNodes.push(data);
  }

  return {
    version: SCHEMA_VERSION,
    name: metadata?.name ?? 'Optical Scene',
    description: metadata?.description ?? '',
    nodes: serializedNodes
  };
}

export function deserializeScene(data: SerializedScene, targetScene?: SceneGraph): SceneGraph {
  const scene = targetScene ?? new SceneGraph();
  scene.clear();

  for (let i = 0; i < data.nodes.length; i++) {
    const n = data.nodes[i];
    let nodeInstance: SceneNode | null = null;

    if (n.type === 'emitter') {
      nodeInstance = new EmitterNode(n.id, n.position, n.rotation, n.params as EmitterOptions);
    } else if (n.type === 'prism') {
      nodeInstance = new PrismNode(n.id, n.position, n.rotation, n.params as PrismOptions);
    } else if (n.type === 'lens') {
      nodeInstance = new LensNode(n.id, n.position, n.rotation, n.params as LensOptions);
    } else if (n.type === 'black_hole') {
      nodeInstance = new BlackHoleNode(n.id, n.position, n.rotation, n.params as BlackHoleOptions);
    } else if (n.type === 'barrier') {
      nodeInstance = new BarrierNode(n.id, n.position, n.rotation, n.params as BarrierOptions);
    }

    if (nodeInstance) {
      scene.addNode(nodeInstance);
    }
  }

  scene.updateFlatCache();
  return scene;
}

export function serializeToJSON(
  scene: SceneGraph,
  metadata?: { name?: string; description?: string }
): string {
  const data = serializeScene(scene, metadata);
  return JSON.stringify(data);
}

export function deserializeFromJSON(jsonString: string, targetScene?: SceneGraph): SceneGraph {
  const data = JSON.parse(jsonString) as SerializedScene;
  return deserializeScene(data, targetScene);
}

export function encodeToURLHash(scene: SceneGraph): string {
  const json = serializeToJSON(scene);
  return LZString.compressToEncodedURIComponent(json);
}

export function decodeFromURLHash(hash: string, targetScene?: SceneGraph): SceneGraph | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(hash);
    if (!json) {
      return null;
    }
    return deserializeFromJSON(json, targetScene);
  } catch {
    return null;
  }
}

export function syncToURL(scene: SceneGraph): void {
  if (typeof window !== 'undefined') {
    const hash = encodeToURLHash(scene);
    window.location.hash = hash.startsWith('#') ? hash : '#' + hash;
  }
}

export function loadFromCurrentURL(targetScene?: SceneGraph): SceneGraph | null {
  if (typeof window !== 'undefined' && window.location.hash && window.location.hash.length > 0) {
    const rawHash = window.location.hash;
    const hash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
    if (hash.length > 0) {
      return decodeFromURLHash(hash, targetScene);
    }
  }
  return null;
}
