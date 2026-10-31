// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLUR_FLUSH_EVENT, PageRedactor } from '../redactor';

const BLURRED = '.mimik-redact';

function scanWith(html: string): Document {
  document.body.innerHTML = html;
  const scanner = new PageRedactor();
  scanner.start(['email']);
  scanner.detach();
  return document;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('text node filtering', () => {
  it('blurs a match in real text', () => {
    scanWith('<p>Write to ada@example.com today</p>');
    expect(document.querySelectorAll(BLURRED)).toHaveLength(1);
    expect(document.querySelector(BLURRED)?.textContent).toBe('ada@example.com');
  });

  it('leaves text with no match alone', () => {
    scanWith('<p>Nothing sensitive here</p>');
    expect(document.querySelectorAll(BLURRED)).toHaveLength(0);
  });

  it('skips empty and whitespace-only nodes without throwing', () => {
    expect(() => scanWith('<p></p><p>   </p><p>\n\t </p><span></span>')).not.toThrow();
    expect(document.querySelectorAll(BLURRED)).toHaveLength(0);
  });

  it('still finds a match among empty and blank siblings', () => {
    scanWith('<p></p><p>   </p><p>ada@example.com</p><p> </p>');
    expect(document.querySelectorAll(BLURRED)).toHaveLength(1);
  });

  it('never walks into an excluded tag', () => {
    scanWith('<script>ada@example.com</script><style>bob@example.com</style><p>carol@example.com</p>');
    expect(document.querySelectorAll(BLURRED)).toHaveLength(1);
    expect(document.querySelector(BLURRED)?.textContent).toBe('carol@example.com');
  });

  it('does not blur inside something already blurred', () => {
    scanWith('<p>ada@example.com and bob@example.com</p>');
    const first = document.querySelectorAll(BLURRED).length;
    const scanner = new PageRedactor();
    scanner.start(['email']);
    scanner.detach();
    expect(document.querySelectorAll(BLURRED)).toHaveLength(first);
  });
});

describe('coverage', () => {
  it('reaches into an open shadow root', () => {
    document.body.innerHTML = '<div id="host"></div><p>carol@example.com</p>';
    const host = document.getElementById('host') as HTMLElement;
    host.attachShadow({ mode: 'open' }).innerHTML = '<p>ada@example.com</p>';

    const scanner = new PageRedactor();
    scanner.start(['email']);
    scanner.detach();

    expect(document.querySelectorAll(BLURRED)).toHaveLength(1);
    expect(host.shadowRoot?.querySelector(BLURRED)?.textContent).toBe('ada@example.com');
    expect(host.shadowRoot?.querySelector('style')).not.toBeNull();

    scanner.stop();
    expect(host.shadowRoot?.querySelectorAll(BLURRED)).toHaveLength(0);
  });

  it('reaches into a same-origin iframe', () => {
    document.body.innerHTML = '<iframe></iframe>';
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    const inner = frame.contentDocument as Document;
    inner.body.innerHTML = '<p>ada@example.com</p>';

    const scanner = new PageRedactor();
    scanner.start(['email']);
    scanner.detach();

    expect(inner.querySelector(BLURRED)?.textContent).toBe('ada@example.com');
    scanner.stop();
    expect(inner.body.innerHTML).toBe('<p>ada@example.com</p>');
  });

  it('covers a select whose options hold a match', () => {
    scanWith('<select><option>ada@example.com</option></select>');
    expect(document.querySelector('select')?.getAttribute('data-mimik-redact')).toBe('field');
  });

  it('masks a match held in a visible attribute and restores it', () => {
    document.body.innerHTML = '<img alt="ada@example.com" src="x"><span title="mail bob@example.com">Hover</span>';
    const scanner = new PageRedactor();
    scanner.start(['email']);
    scanner.detach();

    expect(document.querySelector('img')?.getAttribute('alt')).toBe('•'.repeat('ada@example.com'.length));
    expect(document.querySelector('span')?.getAttribute('title')).toMatch(/^mail •+$/);

    scanner.stop();
    expect(document.querySelector('img')?.getAttribute('alt')).toBe('ada@example.com');
    expect(document.querySelector('span')?.getAttribute('title')).toBe('mail bob@example.com');
  });

  it('keeps blurring new text after it is locked, without toggling on click', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<p>nothing</p>';
    const scanner = new PageRedactor();
    scanner.start(['email']);
    scanner.lock();

    document.body.insertAdjacentHTML('beforeend', '<p>late@example.com</p>');
    await vi.advanceTimersByTimeAsync(400);
    const mark = document.querySelector(BLURRED) as HTMLElement;
    expect(mark.textContent).toBe('late@example.com');

    mark.click();
    expect(mark.classList.contains('mimik-redact-shown')).toBe(false);
    scanner.stop();
    vi.useRealTimers();
  });

  it('still blurs new text on a page that never stops changing', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<p id="tick">0</p>';
    const scanner = new PageRedactor();
    scanner.start(['email']);
    document.body.insertAdjacentHTML('beforeend', '<p>busy@example.com</p>');
    for (let i = 1; i <= 15; i++) {
      document.getElementById('tick')!.textContent = String(i);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(document.querySelector(BLURRED)?.textContent).toBe('busy@example.com');
    scanner.stop();
    vi.useRealTimers();
  });

  it('blurs pending text at once when a capture asks it to', async () => {
    document.body.innerHTML = '<p>nothing</p>';
    const scanner = new PageRedactor();
    scanner.start(['email']);
    document.body.insertAdjacentHTML('beforeend', '<p>modal@example.com</p>');
    await Promise.resolve();
    document.dispatchEvent(new Event(BLUR_FLUSH_EVENT));
    expect(document.querySelector(BLURRED)?.textContent).toBe('modal@example.com');
    scanner.stop();
  });

  it('does not blur text inside an iframe element', () => {
    scanWith('<iframe>ada@example.com</iframe>');
    expect(document.querySelectorAll(BLURRED)).toHaveLength(0);
  });

  it('does blur svg text, which is made of real text nodes', () => {
    scanWith('<svg><text>ada@example.com</text></svg>');
    expect(document.querySelectorAll(BLURRED)).toHaveLength(1);
  });

  it('blurs a whole matching input rather than the matched substring', () => {
    document.body.innerHTML = '<input value="reach me at ada@example.com ok">';
    const scanner = new PageRedactor();
    scanner.start(['email']);
    scanner.detach();

    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('data-mimik-redact')).toBe('field');
    expect(input.style.filter).toContain('blur');
    expect(document.querySelectorAll(BLURRED)).toHaveLength(0);
  });
});
