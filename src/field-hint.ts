export function fieldHint(field: Element): string {
  const doc = field.ownerDocument;
  const parts = Array.from((field as HTMLInputElement).labels ?? []).map((label) => label.textContent ?? '');
  for (const id of (field.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)) {
    parts.push(doc.getElementById(id)?.textContent ?? '');
  }
  for (const name of ['aria-label', 'placeholder', 'title', 'name', 'id']) parts.push(field.getAttribute(name) ?? '');
  return parts.filter((part) => part.trim()).join(' | ');
}
