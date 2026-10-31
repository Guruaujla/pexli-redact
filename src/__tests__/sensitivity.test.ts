import { describe, expect, it } from 'vitest';
import { levelAtLeast } from '../level-at-least';
import { presetsForLevel } from '../presets-for-level';

describe('sensitivity levels', () => {
  it('adds presets as the level rises', () => {
    const low = presetsForLevel('low');
    const medium = presetsForLevel('medium');
    const high = presetsForLevel('high');
    expect(low.every((k) => medium.includes(k))).toBe(true);
    expect(medium.every((k) => high.includes(k))).toBe(true);
    expect(high).toHaveLength(6);
  });

  it('never drops below a workspace minimum', () => {
    expect(levelAtLeast('low', 'medium')).toBe('medium');
    expect(levelAtLeast('high', 'medium')).toBe('high');
  });
});
