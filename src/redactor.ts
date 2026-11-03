import type { BlurDetector } from './detector';
import { fieldHint } from './field-hint';
import { looksTechnical } from './looks-technical';
import { type PresetKey, patternsFor, sensitiveSpans, type TextSpan } from './patterns';
import { personalCells } from './personal-cells';
import { personalHint } from './personal-hint';
import { redactRoots } from './redact-roots';
import { sampleValue } from './sample-value';
import { DEFAULT_REDACT_OPTIONS, type RedactOptions } from './sensitivity';
import { addRedactStyles, PICKED_CLASS, REDACT_CLASS, SAMPLE_CLASS, SHOWN_CLASS } from './styles';

export const REDACT_ATTR = 'data-mimik-redact';

const FIELD_FILTER = 'blur(10px)';
const OWNED = new WeakSet<Element>();
const REPAIRS_PER_TICK = 20;
const REPAIR_TICK_MS = 16;
const HELD_PROPERTIES = ['filter', 'transition-property', 'display'];
const HELD_STYLE: [string, string][] = [
  ['filter', FIELD_FILTER],
  ['transition-property', 'none'],
];
const INLINE_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'cite',
  'code',
  'data',
  'dfn',
  'em',
  'font',
  'i',
  'kbd',
  'label',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
]);
const RESCAN_AFTER_MS = 300;
const RESCAN_AT_MOST_MS = 1000;

export const BLUR_FLUSH_EVENT = 'mimik-blur:flush';
const NON_TEXT_PARENTS = 'input, textarea, select, option, script, style, noscript, iframe';
const MASKED_ATTRIBUTES = ['title', 'alt', 'placeholder', 'aria-label'];
const UNCOVERED_INPUTS = [
  'hidden',
  'checkbox',
  'radio',
  'submit',
  'button',
  'reset',
  'image',
  'range',
  'color',
  'file',
];

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function readableText(root: Document | ShadowRoot, owned: (element: Element) => boolean): Text[] {
  const found: Text[] = [];
  const isDocument = root.nodeType === Node.DOCUMENT_NODE;
  const start = isDocument ? (root as Document).body : root;
  if (!start) return found;
  const owner = isDocument ? (root as Document) : (root.ownerDocument ?? document);
  const walker = owner.createTreeWalker(start, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const parent = text.parentElement;
    if (!parent || parent.matches(NON_TEXT_PARENTS)) continue;
    let inside = false;
    for (
      let el = parent.closest(`[${REDACT_ATTR}]`);
      el && !inside;
      el = el.parentElement?.closest(`[${REDACT_ATTR}]`) ?? null
    )
      inside = owned(el);
    if (inside) continue;
    if (!text.data.trim() && /flex|grid/.test(owner.defaultView?.getComputedStyle(parent).display ?? '')) continue;
    found.push(text);
  }
  return found;
}

const flexRow = (style: CSSStyleDeclaration | undefined) =>
  !!style && style.display.endsWith('flex') && style.flexWrap === 'nowrap' && !style.flexDirection.startsWith('column');

function flowsInline(el: Element, seen: Map<Element, boolean>): boolean {
  const known = seen.get(el);
  if (known !== undefined) return known;
  const view = el.ownerDocument.defaultView;
  const display = view?.getComputedStyle(el).display ?? '';
  const parent = el.parentElement;
  const cell =
    !!parent &&
    el.childElementCount === 0 &&
    (el.textContent ?? '').trim().length === 1 &&
    flexRow(view?.getComputedStyle(parent));
  const inline = INLINE_TAGS.has(el.localName) || display.startsWith('inline') || display === 'contents' || cell;
  seen.set(el, inline);
  return inline;
}

function textRuns(texts: Text[]): Text[][] {
  const runs: Text[][] = [];
  const seen = new Map<Element, boolean>();
  let block: Node | null = null;
  for (const text of texts) {
    let el = text.parentElement;
    while (el && flowsInline(el, seen)) el = el.parentElement;
    const owner: Node = el ?? text.getRootNode();
    if (owner === block) runs[runs.length - 1]!.push(text);
    else runs.push([text]);
    block = owner;
  }
  return runs;
}

function fieldText(field: Field): string {
  if (field.localName !== 'select') return (field as HTMLInputElement).value;
  return Array.from((field as HTMLSelectElement).options, (option) => option.text).join('\n');
}

export class PageRedactor implements BlurDetector {
  private kinds: PresetKey[] = [];
  private options: RedactOptions = DEFAULT_REDACT_OPTIONS;
  private editable = true;
  private readonly originals = new WeakMap<Element, string>();
  private readonly masked = new Map<Element, Map<string, { original: string; masked: string }>>();
  private held = new WeakSet<HTMLElement>();
  private revealed = new WeakSet<HTMLElement>();
  private readonly pageStyle = new WeakMap<HTMLElement, [string, string, string][]>();
  private readonly repairs = new Map<HTMLElement, number>();
  private repairReset: ReturnType<typeof setTimeout> | undefined;
  private readonly isOwned = (element: Element) => OWNED.has(element);
  private watcher: MutationObserver | null = null;
  private readonly listening = new Set<Document>();
  private pending: ReturnType<typeof setTimeout> | undefined;
  private dueBy = 0;
  private readonly rescanSoon = () => {
    const now = Date.now();
    if (this.pending === undefined) this.dueBy = now + RESCAN_AT_MOST_MS;
    clearTimeout(this.pending);
    this.pending = setTimeout(this.flush, Math.min(RESCAN_AFTER_MS, Math.max(0, this.dueBy - now)));
  };
  private readonly flush = () => {
    if (this.pending === undefined) return;
    clearTimeout(this.pending);
    this.pending = undefined;
    this.redact();
  };

  start(kinds: PresetKey[], options: RedactOptions = DEFAULT_REDACT_OPTIONS) {
    this.detach();
    this.kinds = kinds;
    this.options = options;
    this.editable = true;
    this.watcher = new MutationObserver((records) => {
      let changed = false;
      for (const record of records) {
        if (record.type === 'attributes') this.repair(record.target as HTMLElement);
        else changed = true;
      }
      if (changed) this.rescanSoon();
    });
    this.redact();
  }

  updatePresets(kinds: PresetKey[], options: RedactOptions = this.options) {
    this.unblurAll();
    this.kinds = kinds;
    this.options = options;
    this.redact();
  }

  lock() {
    this.editable = false;
  }

  stop() {
    this.detach();
    this.unblurAll();
  }

  detach() {
    this.watcher?.disconnect();
    this.watcher = null;
    for (const doc of this.listening) {
      doc.removeEventListener('input', this.rescanSoon, true);
      doc.removeEventListener('load', this.rescanSoon, true);
      doc.removeEventListener(BLUR_FLUSH_EVENT, this.flush);
    }
    this.listening.clear();
    clearTimeout(this.pending);
    this.pending = undefined;
  }

  unblurAll() {
    for (const root of redactRoots(document)) {
      for (const mark of Array.from(root.querySelectorAll(`span[${REDACT_ATTR}]`))) {
        const parent = mark.parentNode;
        mark.replaceWith(this.originals.get(mark) ?? mark.textContent ?? '');
        parent?.normalize();
      }
      for (const field of Array.from(
        root.querySelectorAll<HTMLElement>(`[${REDACT_ATTR}="field"], [${REDACT_ATTR}="cell"]`),
      )) {
        this.release(field);
        OWNED.delete(field);
        if (!field.getAttribute('style')) field.removeAttribute('style');
        field.removeAttribute(REDACT_ATTR);
      }
      for (const picked of Array.from(root.querySelectorAll<HTMLElement>(`.${PICKED_CLASS}`))) {
        picked.classList.remove(PICKED_CLASS);
        if (picked.getAttribute(REDACT_ATTR) !== 'manual') continue;
        this.release(picked);
        picked.removeAttribute(REDACT_ATTR);
        if (!picked.getAttribute('style')) picked.removeAttribute('style');
      }
    }
    this.held = new WeakSet();
    this.revealed = new WeakSet();
    for (const [element, attributes] of this.masked) {
      for (const [name, { original }] of attributes) element.setAttribute(name, original);
    }
    this.masked.clear();
  }

  private redact() {
    const patterns = patternsFor(this.kinds);
    const roots = redactRoots(document);
    for (const root of roots) this.watch(root);
    const personal = this.kinds.includes('personal');
    if (patterns.length === 0 && !personal && !this.options.coverAllFields) return;
    for (const root of roots) {
      addRedactStyles(root);
      if (personal) this.coverPersonalCells(root);
      if (patterns.length > 0) {
        for (const run of textRuns(readableText(root, this.isOwned))) this.markRun(run, patterns);
        for (const element of Array.from(root.querySelectorAll(MASKED_ATTRIBUTES.map((a) => `[${a}]`).join(', '))))
          this.maskAttributes(element);
      }
      this.coverFields(root, patterns, personal);
    }
  }

  private coverPersonalCells(root: Document | ShadowRoot) {
    for (const cell of personalCells(root)) {
      const marked = cell.closest(`[${REDACT_ATTR}]`);
      if ((!marked || !this.isOwned(marked)) && cell.textContent?.trim()) this.cover(cell, 'cell');
    }
  }

  private coverFields(root: Document | ShadowRoot, patterns: RegExp[], personal: boolean) {
    for (const field of Array.from(root.querySelectorAll<Field>('input, textarea, select'))) {
      const text = fieldText(field);
      if (OWNED.has(field)) continue;
      const coverable = !UNCOVERED_INPUTS.includes(field.type);
      const named =
        coverable &&
        personal &&
        !looksTechnical(text) &&
        personalHint(fieldHint(field), field.getAttribute('autocomplete') ?? '');
      if (named || (text && (sensitiveSpans(text, patterns).length > 0 || (coverable && this.options.coverAllFields))))
        this.cover(field, 'field');
    }
  }

  private watch(root: Document | ShadowRoot) {
    if (!this.watcher) return;
    const isDocument = root.nodeType === Node.DOCUMENT_NODE;
    const target = isDocument ? (root as Document).documentElement : root;
    if (target)
      this.watcher.observe(target, {
        subtree: true,
        childList: true,
        characterData: true,
        attributeFilter: ['style', 'class'],
      });
    if (!isDocument || this.listening.has(root as Document)) return;
    this.listening.add(root as Document);
    root.addEventListener('input', this.rescanSoon, true);
    root.addEventListener('load', this.rescanSoon, true);
    root.addEventListener(BLUR_FLUSH_EVENT, this.flush);
  }

  private toggleOnClick(target: HTMLElement, toggle: () => void) {
    target.addEventListener('click', (event) => {
      if (!this.editable || !event.isTrusted) return;
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });
  }

  private maskAttributes(element: Element) {
    const done = this.masked.get(element) ?? new Map<string, { original: string; masked: string }>();
    for (const name of MASKED_ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (!value || done.get(name)?.masked === value) continue;
      const spans = sensitiveSpans(value, patternsFor(this.kinds));
      if (spans.length === 0) continue;
      let masked = value;
      for (const { start, end } of [...spans].reverse()) {
        const piece = value.slice(start, end);
        const swap = this.options.mode === 'replace' ? this.sampleFor(piece) : '•'.repeat(piece.length);
        masked = masked.slice(0, start) + swap + masked.slice(end);
      }
      done.set(name, { original: value, masked });
      element.setAttribute(name, masked);
    }
    if (done.size > 0) this.masked.set(element, done);
  }

  private sampleFor(original: string): string {
    const kind = this.kinds.find((k) => sensitiveSpans(original, patternsFor([k])).length > 0) ?? this.kinds[0]!;
    return sampleValue(kind, original);
  }

  private markRun(run: Text[], patterns: ReturnType<typeof patternsFor>) {
    const joined = run.length > 1 ? sensitiveSpans(run.map((text) => text.data).join(''), patterns) : [];
    let from = 0;
    for (const text of run) {
      const to = from + text.data.length;
      const spans: (TextSpan & { whole: boolean })[] = sensitiveSpans(text.data, patterns).map((span) => ({
        ...span,
        whole: true,
      }));
      for (const { start, end } of joined) {
        if (start >= to || end <= from || (start >= from && end <= to)) continue;
        spans.push({ start: Math.max(start, from) - from, end: Math.min(end, to) - from, whole: false });
      }
      spans.sort((a, b) => a.start - b.start);
      const merged: (TextSpan & { whole: boolean })[] = [];
      for (const span of spans) {
        const last = merged[merged.length - 1];
        if (last && span.start < last.end) {
          last.end = Math.max(last.end, span.end);
          last.whole = false;
        } else merged.push({ ...span });
      }
      if (merged.length > 0 && text.data.trim()) this.markSpans(text, merged);
      from = to;
    }
  }

  private markSpans(text: Text, spans: (TextSpan & { whole: boolean })[]) {
    const owner = text.ownerDocument;
    for (const { start, end, whole } of [...spans].reverse()) {
      if (end < text.data.length) text.splitText(end);
      const piece = start > 0 ? text.splitText(start) : text;
      const mark = owner.createElement('span');
      piece.replaceWith(mark);
      if (this.options.mode === 'replace' && whole) this.swapForSample(mark, piece.data);
      else {
        mark.className = REDACT_CLASS;
        mark.setAttribute(REDACT_ATTR, 'text');
        OWNED.add(mark);
        mark.style.setProperty('display', 'inline', 'important');
        this.hold(mark);
        mark.append(piece);
        this.toggleOnClick(mark, () => {
          mark.classList.toggle(SHOWN_CLASS);
          this.reveal(mark);
        });
      }
    }
  }

  private swapForSample(mark: HTMLSpanElement, original: string) {
    const sample = this.sampleFor(original);
    mark.className = SAMPLE_CLASS;
    mark.setAttribute(REDACT_ATTR, 'sample');
    OWNED.add(mark);
    mark.textContent = sample;
    this.originals.set(mark, original);
    this.toggleOnClick(mark, () => {
      const showing = mark.classList.toggle(SHOWN_CLASS);
      mark.textContent = showing ? original : sample;
    });
  }

  private cover(field: HTMLElement, kind: 'field' | 'cell') {
    this.hold(field);
    field.setAttribute(REDACT_ATTR, kind);
    OWNED.add(field);
    this.toggleOnClick(field, () => this.reveal(field));
  }

  private reveal(element: HTMLElement) {
    if (this.revealed.has(element)) {
      this.revealed.delete(element);
      this.hold(element);
    } else {
      this.revealed.add(element);
      element.style.setProperty('filter', 'none', 'important');
    }
  }

  private hold(element: HTMLElement) {
    this.held.add(element);
    if (!this.pageStyle.has(element))
      this.pageStyle.set(
        element,
        HELD_PROPERTIES.map((name) => [
          name,
          element.style.getPropertyValue(name),
          element.style.getPropertyPriority(name),
        ]),
      );
    this.pin(element);
    if (element.isConnected && element.ownerDocument.defaultView?.getComputedStyle(element).display === 'contents')
      element.style.setProperty('display', 'block', 'important');
  }

  private release(element: HTMLElement) {
    const saved = this.pageStyle.get(element) ?? HELD_PROPERTIES.map((name) => [name, '', '']);
    for (const [name, value, priority] of saved) {
      if (value) element.style.setProperty(name, value, priority);
      else element.style.removeProperty(name);
    }
    this.pageStyle.delete(element);
    this.held.delete(element);
    this.revealed.delete(element);
  }

  private repair(element: HTMLElement) {
    if (this.revealed.has(element) || !element.style) return;
    const manual = element.getAttribute(REDACT_ATTR) === 'manual';
    if (!this.held.has(element) && !manual) return;
    const count = (this.repairs.get(element) ?? 0) + 1;
    this.repairs.set(element, count);
    this.repairReset ??= setTimeout(() => {
      this.repairReset = undefined;
      this.repairs.clear();
    }, REPAIR_TICK_MS);
    if (count > REPAIRS_PER_TICK) this.surrender(element);
    else if (manual) this.pin(element);
    else this.hold(element);
  }

  private surrender(element: HTMLElement) {
    if (element.getAttribute(REDACT_ATTR) !== 'text' || this.originals.has(element)) return;
    const original = element.textContent ?? '';
    this.originals.set(element, original);
    element.textContent = '•'.repeat(original.length);
  }

  private pin(element: HTMLElement) {
    for (const [name, value] of HELD_STYLE) {
      if (element.style.getPropertyValue(name) !== value || element.style.getPropertyPriority(name) !== 'important')
        element.style.setProperty(name, value, 'important');
    }
  }
}
