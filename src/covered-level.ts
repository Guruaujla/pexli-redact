import type { PresetKey } from './patterns';
import { presetsForLevel } from './presets-for-level';
import { SENSITIVITY_LEVELS, type SensitivityLevel } from './sensitivity';

export function coveredLevel(keys: readonly PresetKey[]): SensitivityLevel | undefined {
  return [...SENSITIVITY_LEVELS].reverse().find((level) => presetsForLevel(level).every((key) => keys.includes(key)));
}
