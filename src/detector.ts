import type { PresetKey } from './patterns';
import type { RedactOptions } from './sensitivity';

export interface BlurDetector {
  start(presets: PresetKey[], options?: RedactOptions): void;
  updatePresets(presets: PresetKey[], options?: RedactOptions): void;
  unblurAll(): void;
  lock(): void;
  detach(): void;
  stop(): void;
}
