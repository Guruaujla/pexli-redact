import type { BlurDetector } from './detector';
import { type PresetKey, patternsFor, sensitiveSpans, type TextSpan } from './patterns';
import { redactRoots } from './redact-roots';
import { sampleValue } from './sample-value';
import { DEFAULT_REDACT_OPTIONS, type RedactOptions } from './sensitivity';
import { addRedactStyles, PICKED_CLASS, REDACT_CLASS, SAMPLE_CLASS, SHOWN_CLASS } from './styles';

export const REDACT_ATTR = 'data-mimik-redact';

const FIELD_FILTER = 'blur(10px)';
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

function readableText(root: Document | ShadowRoot): Text[] {
  const found: Text[] = [];
  const isDocument = root.nodeType === Node.DOCUMENT_NODE;
  const start = isDocument ? (root as Document).body : root;
  if (!start) return found;
  const owner = isDocument ? (root as Document) : (root.ownerDocument ?? document);
  const walker = owner.createTreeWalker(start, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const parent = text.parentElement;
    if (!parent || parent.matches(NON_TEXT_PARENTS) || parent.closest(`[${REDACT_ATTR}]`)) continue;
    if (text.data.trim()) found.push(text);
  }
  return found;
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
    this.watcher = new MutationObserver(this.rescanSoon);
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
      for (const field of Array.from(root.querySelectorAll<HTMLElement>(`[${REDACT_ATTR}="field"]`))) {
        field.style.removeProperty('filter');
        if (!field.getAttribute('style')) field.removeAttribute('style');
        field.removeAttribute(REDACT_ATTR);
      }
      for (const picked of Array.from(root.querySelectorAll(`.${PICKED_CLASS}`))) picked.classList.remove(PICKED_CLASS);
    }
    for (const [element, attributes] of this.masked) {
      for (const [name, { original }] of attributes) element.setAttribute(name, original);
    }
    this.masked.clear();
  }

  private redact() {
    const patterns = patternsFor(this.kinds);
    const roots = redactRoots(document);
    for (const root of roots) this.watch(root);
    if (patterns.length === 0 && !this.options.coverAllFields) return;
    for (const root of roots) {
      addRedactStyles(root);
      if (patterns.length > 0) {
        for (const text of readableText(root)) {
          const spans = sensitiveSpans(text.data, patterns);
          if (spans.length > 0) this.markSpans(text, spans);
        }
        for (const element of Array.from(root.querySelectorAll(MASKED_ATTRIBUTES.map((a) => `[${a}]`).join(', '))))
          this.maskAttributes(element);
      }
      for (const field of Array.from(root.querySelectorAll<Field>('input, textarea, select'))) {
        const text = fieldText(field);
        if (field.hasAttribute(REDACT_ATTR) || !text) continue;
        if (sensitiveSpans(text, patterns).length > 0) this.coverField(field);
        else if (this.options.coverAllFields && !UNCOVERED_INPUTS.includes(field.type)) this.coverField(field);
      }
    }
  }

  private watch(root: Document | ShadowRoot) {
    if (!this.watcher) return;
    const isDocument = root.nodeType === Node.DOCUMENT_NODE;
    const target = isDocument ? (root as Document).documentElement : root;
    if (target) this.watcher.observe(target, { subtree: true, childList: true, characterData: true });
    if (!isDocument || this.listening.has(root as Document)) return;
    this.listening.add(root as Document);
    root.addEventListener('input', this.rescanSoon, true);
    root.addEventListener('load', this.rescanSoon, true);
    root.addEventListener(BLUR_FLUSH_EVENT, this.flush);
  }

  private toggleOnClick(target: HTMLElement, toggle: () => void) {
    target.addEventListener('click', (event) => {
      if (!this.editable) return;
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

  private markSpans(text: Text, spans: TextSpan[]) {
    const owner = text.ownerDocument;
    for (const { start, end } of [...spans].reverse()) {
      if (end < text.data.length) text.splitText(end);
      const piece = start > 0 ? text.splitText(start) : text;
      const mark = owner.createElement('span');
      piece.replaceWith(mark);
      if (this.options.mode === 'replace') this.swapForSample(mark, piece.data);
      else {
        mark.className = REDACT_CLASS;
        mark.setAttribute(REDACT_ATTR, 'text');
        mark.append(piece);
        this.toggleOnClick(mark, () => mark.classList.toggle(SHOWN_CLASS));
      }
    }
  }

  private swapForSample(mark: HTMLSpanElement, original: string) {
    const sample = this.sampleFor(original);
    mark.className = SAMPLE_CLASS;
    mark.setAttribute(REDACT_ATTR, 'sample');
    mark.textContent = sample;
    this.originals.set(mark, original);
    this.toggleOnClick(mark, () => {
      const showing = mark.classList.toggle(SHOWN_CLASS);
      mark.textContent = showing ? original : sample;
    });
  }

  private coverField(field: Field) {
    field.style.setProperty('filter', FIELD_FILTER, 'important');
    field.setAttribute(REDACT_ATTR, 'field');
    this.toggleOnClick(field, () => {
      if (field.style.filter) field.style.removeProperty('filter');
      else field.style.setProperty('filter', FIELD_FILTER, 'important');
    });
  }
}
