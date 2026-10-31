import { type SerializedScene, SCHEMA_VERSION } from '../state/serializer';

export const schwarzschildDeflectionPreset: SerializedScene = {
  version: SCHEMA_VERSION,
  name: 'Schwarzschild Relativistic Deflection',
  description: 'Einstein gravitational lensing, photon-sphere slingshot arcs, event horizon shadow, and gravitational redshift.',
  nodes: [
    {
      id: 'emitter_relativistic',
      type: 'emitter',
      position: { x: 120, y: 320 },
      rotation: 0.0,
      params: {
        beamWidth: 150,
        intensity: 1.4,
        wavelength: 520,
        isWhiteLight: true,
        spectralSamples: 24
      }
    },
    {
      id: 'black_hole_singularity',
      type: 'black_hole',
      position: { x: 420, y: 320 },
      rotation: 0.0,
      params: {
        rs: 18
      }
    }
  ]
};
