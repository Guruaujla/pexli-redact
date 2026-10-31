import { describe, expect, it } from 'vitest';
import { patternsFor, sensitiveSpans } from '../patterns';
import { sampleValue } from '../sample-value';

describe('sampleValue', () => {
  it('gives the same sample for the same value, so identities stay consistent across steps', () => {
    expect(sampleValue('email', 'ada@corp.com')).toBe(sampleValue('email', 'ada@corp.com'));
    expect(sampleValue('email', 'ada@corp.com')).not.toBe(sampleValue('email', 'bob@corp.com'));
  });

  it('uses reserved example domains and ranges', () => {
    expect(sampleValue('email', 'ada@corp.com')).toMatch(/^[a-z]+\.[a-z]+@example\.com$/);
    expect(sampleValue('ipAddress', '10.1.2.3')).toMatch(/^192\.0\.2\.\d{1,3}$/);
    expect(sampleValue('macAddress', 'AA-BB-CC-DD-EE-FF')).toMatch(/^00-00-5E-00-53-[0-9A-F]{2}$/);
    expect(sampleValue('creditCard', '5500 0000 0000 0004')).toBe('4242 4242 4242 4242');
    expect(sampleValue('ssn', '123-45-6789')).toMatch(/^9\d\d-\d\d-\d{4}$/);
  });

  it('keeps the shape of phone numbers and puts 555 in the exchange', () => {
    const sample = sampleValue('phone', '(212) 867-5309');
    expect(sample).toMatch(/^\(\d{3}\) 555-\d{4}$/);
    expect(sampleValue('phone', '+44 20 7946 0958').replace(/\d/g, '0')).toBe('+00 00 0000 0000');
  });

  it('never returns the original', () => {
    for (const [kind, value] of [
      ['email', 'x@y.io'],
      ['phone', '555-123-4567'],
      ['ssn', '987-65-4321'],
      ['ipAddress', '192.0.2.10'],
    ] as const) {
      const sample = sampleValue(kind, value);
      if (sample === value) expect(sampleValue(kind, value)).not.toBe(value);
      expect(sensitiveSpans(sample, patternsFor([kind])).length).toBeGreaterThan(0);
    }
  });
});
