import { columnCells } from './column-cells';
import { looksTechnical } from './looks-technical';
import { personalHint } from './personal-hint';
import { tableRows } from './table-rows';

export function personalCells(root: Document | ShadowRoot): HTMLElement[] {
  const named = (el: Element) => personalHint(el.textContent ?? '');
  const found = Array.from(root.querySelectorAll('table, [role="grid"], [role="treegrid"], [role="table"]')).flatMap(
    (table) => columnCells(tableRows(table), named),
  );
  for (const th of Array.from(root.querySelectorAll('tr > th:first-child, [role="rowheader"]'))) {
    const next = th.nextElementSibling;
    if (next?.matches('td, [role="cell"], [role="gridcell"]') && named(th)) found.push(next as HTMLElement);
  }
  for (const term of Array.from(root.querySelectorAll('dt'))) {
    if (!named(term)) continue;
    for (let dd = term.nextElementSibling; dd?.localName === 'dd'; dd = dd.nextElementSibling)
      found.push(dd as HTMLElement);
  }
  return found.filter((cell) => !looksTechnical(cell.textContent ?? ''));
}
