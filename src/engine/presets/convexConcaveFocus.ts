import { type SerializedScene, SCHEMA_VERSION } from '../state/serializer';
import { LensType } from '../scene/lensNode';

export const convexConcaveFocusPreset: SerializedScene = {
  version: SCHEMA_VERSION,
  name: 'Convex/Concave Lens Caustic Focus',
  description: 'Collimated green laser wavefront focused to a sharp focal caustic point through a biconvex lens.',
  nodes: [
    {
      id: 'emitter_green',
      type: 'emitter',
      position: { x: 100, y: 300 },
      rotation: 0.0,
      params: {
        beamWidth: 80,
        intensity: 1.0,
        wavelength: 532,
        isWhiteLight: false
      }
    },
    {
      id: 'lens_biconvex',
      type: 'lens',
      position: { x: 320, y: 300 },
      rotation: 0.0,
      params: {
        lensType: LensType.Biconvex,
        radius1: 100,
        radius2: 100,
        height: 100,
        thickness: 24,
        refractiveIndex: 1.52,
        cauchyA: 1.5046,
        cauchyB: 4200
      }
    }
  ]
};
