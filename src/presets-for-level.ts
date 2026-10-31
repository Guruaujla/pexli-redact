import type { PresetKey } from './patterns';
import type { SensitivityLevel } from './sensitivity';

const LEVEL_PRESETS: Record<SensitivityLevel, PresetKey[]> = {
  low: ['email', 'phone', 'personal'],
  medium: ['email', 'phone', 'personal', 'ssn', 'creditCard'],
  high: ['email', 'phone', 'personal', 'ssn', 'creditCard', 'ipAddress', 'macAddress'],
};

export function presetsForLevel(level: SensitivityLevel): PresetKey[] {
  return [...LEVEL_PRESETS[level]];
}
