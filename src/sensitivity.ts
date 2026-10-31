export type SensitivityLevel = 'low' | 'medium' | 'high';

export type RedactMode = 'blur' | 'replace';

export interface RedactOptions {
  mode: RedactMode;
  coverAllFields: boolean;
}

export const SENSITIVITY_LEVELS: readonly SensitivityLevel[] = ['low', 'medium', 'high'];

export const DEFAULT_REDACT_OPTIONS: RedactOptions = { mode: 'blur', coverAllFields: false };
