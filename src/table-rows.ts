const GRID = '[role="grid"], [role="treegrid"], [role="table"]';
const ARIA_CELL = '[role="columnheader"], [role="rowheader"], [role="cell"], [role="gridcell"]';

export function tableRows(table: Element): HTMLElement[][] {
  if (table instanceof HTMLTableElement) {
    return Array.from(table.rows).map((row) =>
      Array.from(row.cells).flatMap((cell) => Array<HTMLElement>(Math.max(1, cell.colSpan)).fill(cell)),
    );
  }
  return Array.from(table.querySelectorAll('[role="row"]'))
    .filter((row) => row.closest(GRID) === table)
    .map((row) =>
      Array.from(row.querySelectorAll<HTMLElement>(ARIA_CELL)).filter((cell) => cell.closest('[role="row"]') === row),
    );
}
