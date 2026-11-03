// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { BLUR_FLUSH_EVENT, PageRedactor } from '../redactor';

const BLURRED = '.mimik-redact';
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function start(html: string, kinds: Parameters<PageRedactor['start']>[0] = ['email']) {
  document.body.innerHTML = html;
  const redactor = new PageRedactor();
  redactor.start(kinds);
  return redactor;
}

afterEach(() => {
  document.body.innerHTML = '';
  for (const sheet of document.querySelectorAll('style')) sheet.remove();
});

describe('page CSS and markup that tried to defeat blur (#154)', () => {
  it('turns transitions off inline on marks and covered fields', () => {
    const redactor = start('<p>ada@example.com</p><input value="bob@example.com">');
    for (const el of [document.querySelector(BLURRED), document.querySelector('input')] as HTMLElement[]) {
      expect(el.style.getPropertyValue('transition-property')).toBe('none');
      expect(el.style.getPropertyPriority('transition-property')).toBe('important');
    }
    redactor.stop();
    expect(document.querySelector('input')?.hasAttribute('style')).toBe(false);
  });

  it('puts the blur back when the page resets a mark or field style', async () => {
    const redactor = start('<p>ada@example.com</p><input value="bob@example.com">');
    const mark = document.querySelector(BLURRED) as HTMLElement;
    const field = document.querySelector('input') as HTMLInputElement;
    mark.style.cssText = '';
    field.removeAttribute('style');
    await settle();
    expect(mark.style.getPropertyValue('filter')).toBe('blur(10px)');
    expect(field.style.getPropertyValue('filter')).toBe('blur(10px)');
    redactor.stop();
  });

  it('ignores clicks a page script fakes, so it cannot reveal marks', () => {
    const redactor = start('<p>ada@example.com</p><input value="bob@example.com">');
    for (const el of document.querySelectorAll<HTMLElement>('[data-mimik-redact]')) el.click();
    for (const el of document.querySelectorAll<HTMLElement>('[data-mimik-redact]'))
      expect(el.style.getPropertyValue('filter')).toBe('blur(10px)');
    redactor.stop();
  });

  it('leaves a mark the user revealed alone when its style changes', async () => {
    const redactor = start('<p>ada@example.com</p>');
    const mark = document.querySelector(BLURRED) as HTMLElement;
    redactor['reveal'](mark);
    mark.style.setProperty('color', 'red');
    await settle();
    expect(mark.style.getPropertyValue('filter')).toBe('none');
    redactor.stop();
  });

  it('puts the blur back on a hand-picked element', async () => {
    const redactor = start('<p id="pick">secret</p>');
    const picked = document.getElementById('pick') as HTMLElement;
    picked.setAttribute('data-mimik-redact', 'manual');
    picked.classList.add('mimik-redact-picked');
    await settle();
    expect(picked.style.getPropertyValue('filter')).toBe('blur(10px)');
    picked.style.cssText = '';
    await settle();
    expect(picked.style.getPropertyPriority('filter')).toBe('important');
    redactor.stop();
    expect(picked.hasAttribute('style')).toBe(false);
    expect(picked.hasAttribute('data-mimik-redact')).toBe(false);
  });

  it('takes the secret out of a mark the page keeps un-blurring, without freezing the tab', async () => {
    const redactor = start('<p>ada@example.com</p>');
    const mark = document.querySelector(BLURRED) as HTMLElement;
    let fights = 0;
    const fighter = new MutationObserver(() => {
      if (fights++ < 5000) mark.style.setProperty('filter', 'none', 'important');
    });
    fighter.observe(mark, { attributes: true });
    mark.style.setProperty('filter', 'none', 'important');
    await new Promise((resolve) => setTimeout(resolve, 50));
    fighter.disconnect();
    expect(fights).toBeLessThan(200);
    expect(mark.textContent).toBe('•'.repeat('ada@example.com'.length));
    redactor.stop();
    expect(document.body.innerHTML).toBe('<p>ada@example.com</p>');
  });

  it('lets an unpick stick while Smart Blur runs', async () => {
    const redactor = start('<p id="pick">secret</p>');
    const picked = document.getElementById('pick') as HTMLElement;
    picked.setAttribute('data-mimik-redact', 'manual');
    picked.classList.add('mimik-redact-picked');
    picked.style.setProperty('filter', 'blur(10px)', 'important');
    await settle();
    picked.removeAttribute('data-mimik-redact');
    picked.classList.remove('mimik-redact-picked');
    picked.style.removeProperty('filter');
    await settle();
    expect(picked.style.getPropertyValue('filter')).toBe('');
    redactor.stop();
  });

  it('still scans text the page marked as a manual pick itself', () => {
    const redactor = start('<p data-mimik-redact="manual">ada@example.com</p>');
    expect(document.querySelector(BLURRED)?.textContent).toBe('ada@example.com');
    redactor.stop();
  });

  it('joins pretty-printed one-letter flex cells, whose whitespace is not rendered', () => {
    const cells = [...'4111111111111111'].map((d) => `<span style="display:block">${d}</span>`).join('\n  ');
    const redactor = start(`<div style="display:flex">\n  ${cells}\n</div>`, ['creditCard']);
    expect(document.querySelectorAll(BLURRED)).toHaveLength(16);
    redactor.stop();
  });

  it('does not join a numeric grid or a label next to an email', () => {
    const days = Array.from({ length: 31 }, (_, i) => `<div>${i + 1}</div>`).join('\n');
    const redactor = start(
      `<div style="display:grid">${days}</div>` +
        '<p><span style="display:inline-block">Contact</span> <span style="display:inline-block">ada@example.com</span></p>',
      ['email', 'phone', 'creditCard', 'ssn'],
    );
    expect([...document.querySelectorAll(BLURRED)].map((n) => n.textContent)).toEqual(['ada@example.com']);
    redactor.stop();
  });

  it('blurs a copy of a covered field or mark that the page made', async () => {
    const redactor = start('<p id="p">ada@example.com</p><input value="bob@example.com">');
    const field = document.querySelector('input') as HTMLInputElement;
    const copy = field.cloneNode(true) as HTMLInputElement;
    copy.removeAttribute('style');
    copy.value = 'bob@example.com';
    const markCopy = (document.querySelector(BLURRED) as HTMLElement).cloneNode(true) as HTMLElement;
    markCopy.removeAttribute('style');
    document.body.append(copy, markCopy);
    await settle();
    document.dispatchEvent(new Event(BLUR_FLUSH_EVENT));
    expect(copy.style.getPropertyValue('filter')).toBe('blur(10px)');
    expect(markCopy.querySelector(BLURRED)).not.toBeNull();
    redactor.stop();
  });

  it('does not let the page opt text out by adding the redact attribute itself', () => {
    const redactor = start('<p data-mimik-redact="text">ada@example.com</p>');
    expect(document.querySelector(BLURRED)?.textContent).toBe('ada@example.com');
    redactor.stop();
  });

  it('gives a covered cell with display:contents a box so the blur shows', () => {
    const redactor = start(
      '<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td style="display:contents">Ada Lovelace</td></tr></tbody></table>',
      ['personal'],
    );
    const cell = document.querySelector('td') as HTMLElement;
    expect(cell.getAttribute('data-mimik-redact')).toBe('cell');
    expect(cell.style.getPropertyValue('display')).toBe('block');
    redactor.stop();
    expect(cell.style.getPropertyValue('display')).toBe('contents');
  });

  it('joins a match split across elements styled display:inline or custom elements', () => {
    const redactor = start(
      '<style>.i{display:inline}</style><p><div class="i">ada@</div><div class="i">example.com</div></p>' +
        '<p><x-a>bob@</x-a><x-b>example.com</x-b></p>',
    );
    expect([...document.querySelectorAll(BLURRED)].map((n) => n.textContent)).toEqual([
      'ada@',
      'example.com',
      'bob@',
      'example.com',
    ]);
    redactor.stop();
  });

  it('joins digits laid out one per cell in a flex row', () => {
    const cells = [...'4111111111111111'].map((d) => `<span style="display:block">${d}</span>`).join('');
    const redactor = start(`<div style="display:flex">${cells}</div>`, ['creditCard']);
    expect(document.querySelectorAll(BLURRED)).toHaveLength(16);
    redactor.stop();
  });

  it('finds an email hidden with a zero-width space and a card in full-width digits', () => {
    const redactor = start('<p>jane​.doe@example.com</p><p>４１１１ １１１１ １１１１ １１１１</p>', [
      'email',
      'creditCard',
    ]);
    expect([...document.querySelectorAll(BLURRED)].map((n) => n.textContent)).toEqual([
      'jane​.doe@example.com',
      '４１１１ １１１１ １１１１ １１１１',
    ]);
    redactor.stop();
  });
});
