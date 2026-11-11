import { sourceTableCellInsets } from './table-source-insets.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';
import { sourceTableRowHorizontals } from './source-table-row-horizontals.mjs';

// Redistribute the selected physical rectangle. HU remainders go left to right.
export function sourceTableCellWidthPlan(table, request) {
  const fail = (error) => {
    throw Error(error);
  };
  const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff && !Object.is(n, -0);
  if (
    !request ||
    ![
      request.section,
      request.tableNode,
      request.expectedRows,
      request.expectedColumns,
      request.top,
      request.left,
      request.bottom,
      request.right,
    ].every(uint) ||
    request.top >= request.bottom ||
    request.left + 1 >= request.right ||
    request.bottom > request.expectedRows ||
    request.right > request.expectedColumns ||
    table?.section !== request.section ||
    table.tableNode !== request.tableNode ||
    table.rows !== request.expectedRows ||
    table.columns !== request.expectedColumns ||
    table.partial ||
    table.createdTable ||
    table.parentListNode != null ||
    table.rows * table.columns > 4096 ||
    table.cells?.length !== table.rows * table.columns
  )
    fail('InvalidSourceTableCellWidthRectangle');
  if (table.cells.some((cell) => cell.rowSpan !== 1 || cell.columnSpan !== 1 || !uint(cell.height)))
    fail('UnsupportedSourceTableCellWidthGeometry');
  // Nonspanning source cells have one slot each. Index once, without per-row scans.
  const slots = Array.from({ length: table.cells.length });
  for (const cell of table.cells) {
    if (
      !uint(cell.row) ||
      !uint(cell.column) ||
      cell.row >= table.rows ||
      cell.column >= table.columns
    )
      fail('InvalidSourceTableCellWidthRectangle');
    const index = cell.row * table.columns + cell.column;
    if (slots[index]) fail('InvalidSourceTableCellWidthRectangle');
    slots[index] = cell;
  }
  const geometry = sourceTableRowHorizontals({ ...table, cells: slots }, { orderedCells: true });
  if (geometry.state !== 'resolved') fail(geometry.error);
  const boxes = new Map(geometry.cells.map((cell) => [cell.listNode, cell]));
  const selectedRows = [];
  let start, extent;
  for (let row = request.top; row < request.bottom; row++) {
    const cells = slots.slice(
      row * table.columns + request.left,
      row * table.columns + request.right,
    );
    const x = boxes.get(cells[0].listNode).x;
    const width = cells.reduce((sum, cell) => sum + cell.width, 0);
    if (start !== undefined && (x !== start || width !== extent))
      fail('NonRectangularSourceTableCellWidthGeometry');
    start = x;
    extent = width;
    selectedRows.push(cells);
  }
  const count = request.right - request.left;
  const base = Math.floor(extent / count),
    remainder = extent % count;
  if (base < 1) fail('UnsupportedSourceTableCellWidthGeometry');
  const edits = [];
  for (const cells of selectedRows)
    for (const [index, cell] of cells.entries()) {
      const width = base + Number(index < remainder);
      const insets = sourceTableCellInsets(table, cell);
      if (!insets || hwpUnitPixels(width) <= insets.left + insets.right)
        fail('UnsupportedSourceTableCellWidthInsets');
      if (cell.width !== width)
        edits.push({ section: table.section, listNode: cell.listNode, width, height: cell.height });
    }
  return edits;
}
