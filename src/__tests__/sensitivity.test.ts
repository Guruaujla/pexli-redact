import { describe, expect, it } from 'vitest';
import { coveredLevel } from '../covered-level';
import { levelAtLeast } from '../level-at-least';
import { presetsForLevel } from '../presets-for-level';

describe('sensitivity levels', () => {
  it('adds presets as the level rises', () => {
    const low = presetsForLevel('low');
    const medium = presetsForLevel('medium');
    const high = presetsForLevel('high');
    expect(low.every((k) => medium.includes(k))).toBe(true);
    expect(medium.every((k) => high.includes(k))).toBe(true);
    expect(high).toHaveLength(7);
  });

  it('never drops below a workspace minimum', () => {
    expect(levelAtLeast('low', 'medium')).toBe('medium');
    expect(levelAtLeast('high', 'medium')).toBe('high');
  });

  it('names the highest level a set of presets fully covers', () => {
    expect(coveredLevel(presetsForLevel('high'))).toBe('high');
    expect(coveredLevel(['email', 'phone', 'personal', 'ssn'])).toBe('low');
    expect(coveredLevel(['email', 'phone', 'ssn'])).toBeUndefined();
    expect(coveredLevel(['email'])).toBeUndefined();
  });
});
