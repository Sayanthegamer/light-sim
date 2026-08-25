import { type SerializedScene, SCHEMA_VERSION } from '../state/serializer';

export const tirRetroreflectorPreset: SerializedScene = {
  version: SCHEMA_VERSION,
  name: 'TIR Porro Prism Retroreflector',
  description: 'Total internal reflection inside a 45-45-90 right angle prism reflecting light 180 degrees back.',
  nodes: [
    {
      id: 'emitter_yellow',
      type: 'emitter',
      position: { x: 140, y: 260 },
      rotation: 0.0,
      params: {
        beamWidth: 20,
        intensity: 1.2,
        wavelength: 589, // Sodium D line
        isWhiteLight: false
      }
    },
    {
      id: 'prism_porro',
      type: 'prism',
      position: { x: 380, y: 300 },
      rotation: 0.0,
      params: {
        vertices: [
          { x: -50, y: -60 },
          { x: -50, y: 60 },
          { x: 50, y: 0 }
        ],
        refractiveIndex: 1.52, // Critical angle ~41.14° < 45°
        cauchyA: 1.5046,
        cauchyB: 0.0042,
        isDispersive: false
      }
    }
  ]
};
