/**
 * 5 Bundled Optical Presets
 */

import { newtonPrismPreset } from './newtonPrism';
import { convexConcaveFocusPreset } from './convexConcaveFocus';
import { schwarzschildDeflectionPreset } from './schwarzschildDeflection';
import { tirRetroreflectorPreset } from './tirRetroreflector';
import { achromaticDoubletPreset } from './achromaticDoublet';

export * from './newtonPrism';
export * from './convexConcaveFocus';
export * from './schwarzschildDeflection';
export * from './tirRetroreflector';
export * from './achromaticDoublet';

export const ALL_PRESETS = [
  newtonPrismPreset,
  convexConcaveFocusPreset,
  schwarzschildDeflectionPreset,
  tirRetroreflectorPreset,
  achromaticDoubletPreset
];
