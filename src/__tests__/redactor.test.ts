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

describe('leaks the release gate found', () => {
  it('blurs a match split across inline tags', () => {
    scanWith('<p>Call <b>ada@</b>example.com or <span>bob@exa</span><i>mple.com</i></p>');
    const pieces = [...document.querySelectorAll(BLURRED)].map((n) => n.textContent);
    expect(pieces).toEqual(['ada@', 'example.com', 'bob@exa', 'mple.com']);
  });

  it('does not join text across block elements', () => {
    scanWith('<div>ada@</div><div>example.com</div>');
    expect(document.querySelectorAll(BLURRED)).toHaveLength(0);
  });

  it('still finds a match inside one node next to another inline node', () => {
    scanWith('<p><span>mail ada@example.com</span><span>next</span></p>');
    expect(document.querySelector(BLURRED)?.textContent).toBe('ada@example.com');
  });

  it('blurs split matches in replace mode, since a sample cannot be split', () => {
    document.body.innerHTML = '<p><b>ada@</b>example.com and bob@example.com</p>';
    const scanner = new PageRedactor();
    scanner.start(['email'], { mode: 'replace', coverAllFields: false });
    scanner.detach();
    expect([...document.querySelectorAll(BLURRED)].map((n) => n.textContent)).toEqual(['ada@', 'example.com']);
    expect(document.body.textContent).not.toContain('bob@example.com');
    scanner.stop();
    expect(document.body.innerHTML).toBe('<p><b>ada@</b>example.com and bob@example.com</p>');
  });

  it('sets the blur inline and important so page styles cannot turn it off', () => {
    scanWith('<p>ada@example.com</p>');
    const mark = document.querySelector(BLURRED) as HTMLElement;
    expect(mark.style.getPropertyValue('filter')).toBe('blur(10px)');
    expect(mark.style.getPropertyPriority('filter')).toBe('important');
    expect(mark.style.getPropertyPriority('display')).toBe('important');
  });

  it('shows and hides a mark through its inline style', () => {
    document.body.innerHTML = '<p>ada@example.com</p>';
    const scanner = new PageRedactor();
    scanner.start(['email']);
    const mark = document.querySelector(BLURRED) as HTMLElement;
    scanner['reveal'](mark);
    expect(mark.style.getPropertyValue('filter')).toBe('none');
    scanner['reveal'](mark);
    expect(mark.style.getPropertyValue('filter')).toBe('blur(10px)');
    scanner.stop();
  });
});

describe('names and addresses', () => {
  const scanPersonal = (html: string) => {
    document.body.innerHTML = html;
    const scanner = new PageRedactor();
    scanner.start(['personal']);
    scanner.detach();
    return scanner;
  };
  const covered = () =>
    [...document.querySelectorAll('[data-mimik-redact]')].map((n) => n.getAttribute('data-mimik-redact'));

  it('covers fields whose label, name or autocomplete marks a person', () => {
    scanPersonal(
      '<label>Full name <input value="Ada Lovelace"></label><input name="zip" value="90210"><input autocomplete="family-name" value="Lovelace"><input name="username" value="ada"><input name="company" value="Acme">',
    );
    const inputs = [...document.querySelectorAll('input')];
    expect(inputs.map((i) => i.hasAttribute('data-mimik-redact'))).toEqual([true, true, true, false, false]);
  });

  it('covers table cells under a name or address header and leaves the rest', () => {
    scanPersonal(
      '<table><thead><tr><th>Name</th><th>Plan</th><th colspan="2">Address</th></tr></thead><tbody><tr><td>Ada</td><td>Team</td><td>1 Main St</td><td>Leeds</td></tr></tbody></table>',
    );
    const cells = [...document.querySelectorAll('td')];
    expect(cells.map((c) => c.getAttribute('data-mimik-redact'))).toEqual(['cell', null, 'cell', 'cell']);
    expect(cells[0]!.style.getPropertyPriority('filter')).toBe('important');
  });

  it('covers row-header tables and definition lists', () => {
    scanPersonal(
      '<table><tr><th>Birthday</th><td>1 May</td></tr><tr><th>Role</th><td>Admin</td></tr></table><dl><dt>Name</dt><dd>Ada</dd><dt>Team</dt><dd>Ops</dd></dl>',
    );
    expect(covered()).toEqual(['cell', 'cell']);
    expect([...document.querySelectorAll('[data-mimik-redact]')].map((n) => n.textContent)).toEqual(['1 May', 'Ada']);
  });

  it('covers an empty name field before anything is typed or pasted into it', () => {
    scanPersonal('<label>Full name <input id="n"></label><input name="search">');
    expect(document.getElementById('n')!.getAttribute('data-mimik-redact')).toBe('field');
    expect(document.querySelector('[name="search"]')!.hasAttribute('data-mimik-redact')).toBe(false);
  });

  it('lets a label decide over an id or name', () => {
    scanPersonal(
      '<label for="a">First name</label><input id="a" name="user[first_name]"><label for="b">Company name</label><input id="b" name="name"><input id="field-:r2:" aria-label="Last name"><input name="user[last_name]">',
    );
    expect([...document.querySelectorAll('input')].map((i) => i.hasAttribute('data-mimik-redact'))).toEqual([
      true,
      false,
      true,
      true,
    ]);
  });

  it('leaves IPs, hosts and file names in name or address columns', () => {
    scanPersonal(
      '<table><tr><th>Name</th><th>Address</th></tr><tr><td>report.pdf</td><td>10.0.0.4</td></tr><tr><td>Ada Lovelace</td><td>api.acme.io</td></tr></table>',
    );
    expect([...document.querySelectorAll('[data-mimik-redact]')].map((n) => n.textContent)).toEqual(['Ada Lovelace']);
  });

  it('covers ARIA grids, row headers and header rows with a checkbox column', () => {
    scanPersonal(
      '<div role="grid"><div role="row"><span role="columnheader">Customer name</span><span role="columnheader">Plan</span></div><div role="row"><span role="gridcell">Maria Garcia</span><span role="gridcell">Pro</span></div></div>' +
        '<table><tr><td><input type="checkbox"></td><th>Name</th><th>Plan</th></tr><tr><td><input type="checkbox"></td><th scope="row">Jon Snow</th><td>Free</td></tr></table>',
    );
    expect([...document.querySelectorAll('[data-mimik-redact]')].map((n) => n.textContent)).toEqual([
      'Maria Garcia',
      'Jon Snow',
    ]);
  });

  it('restores the page exactly', () => {
    const html = '<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Ada</td></tr></tbody></table>';
    const scanner = scanPersonal(html);
    scanner.stop();
    expect(document.body.innerHTML).toBe(html);
  });

  it('does nothing when the preset is off', () => {
    document.body.innerHTML = '<label>Name <input value="Ada"></label>';
    const scanner = new PageRedactor();
    scanner.start(['email']);
    scanner.detach();
    expect(covered()).toEqual([]);
  });
});
