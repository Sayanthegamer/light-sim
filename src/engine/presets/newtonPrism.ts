import { type SerializedScene, SCHEMA_VERSION } from '../state/serializer';

export const newtonPrismPreset: SerializedScene = {
  version: SCHEMA_VERSION,
  name: "Newton's Prism Dispersion",
  description: 'White continuous spectrum beam dispersed into rainbow wavelengths via a Crown Glass equilateral prism.',
  nodes: [
    {
      id: 'emitter_white',
      type: 'emitter',
      position: { x: 140, y: 350 },
      rotation: 0.15, // slight angle towards prism
      params: {
        beamWidth: 24,
        intensity: 1.2,
        wavelength: 550,
        isWhiteLight: true,
        spectralSamples: 24
      }
    },
    {
      id: 'prism_crown',
      type: 'prism',
      position: { x: 380, y: 350 },
      rotation: 0.0,
      params: {
        vertices: [
          { x: -50, y: -45 },
          { x: 50, y: -45 },
          { x: 0, y: 45 }
        ],
        refractiveIndex: 1.517, // Crown glass N-BK7
        cauchyA: 1.5046,
        cauchyB: 4200,
        isDispersive: true
      }
    }
  ]
};
