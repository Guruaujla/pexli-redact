import { SENSITIVITY_LEVELS, type SensitivityLevel } from './sensitivity';

export function levelAtLeast(level: SensitivityLevel, minimum: SensitivityLevel): SensitivityLevel {
  return SENSITIVITY_LEVELS.indexOf(level) >= SENSITIVITY_LEVELS.indexOf(minimum) ? level : minimum;
}
