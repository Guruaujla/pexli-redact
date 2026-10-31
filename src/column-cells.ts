const HEADER = 'thead *, th:not([scope="row"]), [role="columnheader"]';

export function columnCells(rows: HTMLElement[][], named: (el: Element) => boolean): HTMLElement[] {
  const header = rows.find(
    (row) =>
      row.some((cell) => cell.matches(HEADER)) &&
      row.every((cell) => cell.matches(HEADER) || !cell.textContent?.trim()),
  );
  if (!header) return [];
  const columns = new Set(header.flatMap((cell, i) => (cell.matches(HEADER) && named(cell) ? [i] : [])));
  const found = new Set<HTMLElement>();
  if (columns.size === 0) return [];
  for (const row of rows) {
    if (row === header) continue;
    row.forEach((cell, i) => {
      if (columns.has(i) && !cell.matches(HEADER)) found.add(cell);
    });
  }
  return [...found];
}
