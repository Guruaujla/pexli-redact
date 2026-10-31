// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { PageRedactor } from '../redactor';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('replace with sample data', () => {
  it('swaps matches for samples and restores the page on stop', () => {
    const html = '<p>Mail ada@corp.com or call (212) 867-5309. ada@corp.com again.</p>';
    document.body.innerHTML = html;
    const scanner = new PageRedactor();
    scanner.start(['email', 'phone'], { mode: 'replace', coverAllFields: false });
    scanner.detach();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('ada@corp.com');
    expect(text).not.toContain('867-5309');
    const samples = [...document.querySelectorAll('[data-mimik-redact="sample"]')].map((n) => n.textContent);
    expect(samples).toHaveLength(3);
    expect(samples[0]).toBe(samples[2]);
    expect(document.querySelector('.mimik-redact')).toBeNull();
    scanner.stop();
    expect(document.body.innerHTML).toBe(html);
  });

  it('blurs form fields instead of changing their values', () => {
    document.body.innerHTML = '<input value="ada@corp.com"><input type="checkbox" value="x" checked>';
    const scanner = new PageRedactor();
    scanner.start(['email'], { mode: 'replace', coverAllFields: false });
    scanner.detach();
    const [field, box] = document.querySelectorAll('input');
    expect(field!.value).toBe('ada@corp.com');
    expect(field!.getAttribute('data-mimik-redact')).toBe('field');
    expect(box!.hasAttribute('data-mimik-redact')).toBe(false);
    scanner.stop();
  });

  it('covers every filled field at the high level even without a pattern match', () => {
    document.body.innerHTML = '<input value="Ada Lovelace"><textarea>12 Main St</textarea><input value="">';
    const scanner = new PageRedactor();
    scanner.start([], { mode: 'blur', coverAllFields: true });
    scanner.detach();
    expect(document.querySelectorAll('[data-mimik-redact="field"]')).toHaveLength(2);
    scanner.stop();
  });
});
