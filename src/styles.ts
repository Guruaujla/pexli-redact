export const REDACT_CLASS = 'mimik-redact';
export const SHOWN_CLASS = 'mimik-redact-shown';
export const PICKED_CLASS = 'mimik-redact-picked';
export const SAMPLE_CLASS = 'mimik-redact-sample';

const SHEET_ID = 'mimik-redact-sheet';
const SOFTNESS = 'blur(10px)';

export function addRedactStyles(root: Document | ShadowRoot = document) {
  if (root.querySelector(`#${SHEET_ID}`)) return;
  const owner = root.nodeType === Node.DOCUMENT_NODE ? (root as Document) : (root.ownerDocument ?? document);
  const sheet = Object.assign(owner.createElement('style'), { id: SHEET_ID });
  sheet.textContent = [
    `.${REDACT_CLASS}, .${PICKED_CLASS} { filter: ${SOFTNESS} !important; transition: filter 150ms ease-out; }`,
    `.${REDACT_CLASS}.${SHOWN_CLASS} { filter: none !important; }`,
    `.${SAMPLE_CLASS}.${SHOWN_CLASS} { outline: 1px dashed currentColor; }`,
  ].join('\n');
  (root.nodeType === Node.DOCUMENT_NODE
    ? ((root as Document).head ?? (root as Document).documentElement)
    : root
  ).appendChild(sheet);
}

export function removeRedactStyles() {
  document.getElementById(SHEET_ID)?.remove();
}
