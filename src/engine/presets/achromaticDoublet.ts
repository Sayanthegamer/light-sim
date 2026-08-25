import { type SerializedScene, SCHEMA_VERSION } from '../state/serializer';
import { LensType } from '../scene/lensNode';

export const achromaticDoubletPreset: SerializedScene = {
  version: SCHEMA_VERSION,
  name: 'Achromatic Doublet (Crown + Flint)',
  description: 'Chromatic aberration correction pairing a Crown glass convex lens with a Flint glass concave lens.',
  nodes: [
    {
      id: 'emitter_white',
      type: 'emitter',
      position: { x: 100, y: 300 },
      rotation: 0.0,
      params: {
        beamWidth: 50,
        intensity: 1.2,
        wavelength: 550,
        isWhiteLight: true,
        spectralSamples: 16
      }
    },
    {
      id: 'lens_crown_convex',
      type: 'lens',
      position: { x: 280, y: 300 },
      rotation: 0.0,
      params: {
        lensType: LensType.Biconvex,
        radius1: 100,
        radius2: 100,
        height: 80,
        thickness: 20,
        refractiveIndex: 1.517, // N-BK7 Crown Glass
        cauchyA: 1.5046,
        cauchyB: 0.0042
      }
    },
    {
      id: 'lens_flint_concave',
      type: 'lens',
      position: { x: 330, y: 300 },
      rotation: 0.0,
      params: {
        lensType: LensType.Biconvex,
        radius1: 120,
        radius2: 120,
        height: 80,
        thickness: 16,
        refractiveIndex: 1.62, // Flint Glass F2
        cauchyA: 1.5892,
        cauchyB: 0.0098
      }
    }
  ]
};
