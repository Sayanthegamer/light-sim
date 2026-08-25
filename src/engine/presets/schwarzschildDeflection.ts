import { type SerializedScene, SCHEMA_VERSION } from '../state/serializer';

export const schwarzschildDeflectionPreset: SerializedScene = {
  version: SCHEMA_VERSION,
  name: 'Schwarzschild Relativistic Deflection',
  description: 'Grazing beam geodesic deflection, photon sphere capture, and gravitational redshift around a black hole.',
  nodes: [
    {
      id: 'emitter_blue',
      type: 'emitter',
      position: { x: 100, y: 220 },
      rotation: 0.0,
      params: {
        beamWidth: 60,
        intensity: 1.0,
        wavelength: 480,
        isWhiteLight: false
      }
    },
    {
      id: 'black_hole_singularity',
      type: 'black_hole',
      position: { x: 380, y: 320 },
      rotation: 0.0,
      params: {
        rs: 25
      }
    }
  ]
};
