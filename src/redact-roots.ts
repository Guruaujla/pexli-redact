export function redactRoots(start: Document): (Document | ShadowRoot)[] {
  const roots: (Document | ShadowRoot)[] = [];
  const visit = (root: Document | ShadowRoot) => {
    roots.push(root);
    const owner = root.nodeType === Node.DOCUMENT_NODE ? (root as Document) : (root.ownerDocument ?? start);
    const walker = owner.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const element = node as Element;
      if (element.shadowRoot) visit(element.shadowRoot);
      if (element.localName !== 'iframe' && element.localName !== 'frame') continue;
      let inner: Document | null = null;
      try {
        inner = (element as HTMLIFrameElement).contentDocument;
      } catch {
        inner = null;
      }
      if (inner?.body) visit(inner);
    }
  };
  visit(start);
  return roots;
}
