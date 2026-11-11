import { orderedSourceTableCells } from './source-table-rectangular-grid.mjs';
import { sourceTableRowHorizontals } from './source-table-row-horizontals.mjs';

/** Keep the selected full-width band's total HU height and all column widths. */
export function sourceTableCellHeightPlan(table, request) {
  const uint = (value) =>
    Number.isInteger(value) && value >= 0 && value <= 0xffffffff && !Object.is(value, -0);
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
    request.bottom - request.top < 2 ||
    request.top >= request.bottom ||
    request.left !== 0 ||
    request.right !== request.expectedColumns ||
    request.bottom > request.expectedRows ||
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
    throw Error('InvalidSourceTableCellHeightRectangle');
  if (table.cells.some((cell) => cell.rowSpan !== 1 || cell.columnSpan !== 1))
    throw Error('UnsupportedSourceTableCellHeightSpans');
  if (table.cells.some((cell) => !uint(cell.height)))
    throw Error('UnsupportedSourceTableCellHeightGeometry');
  const slots = orderedSourceTableCells(table, 'InvalidSourceTableCellHeightRectangle');
  const geometry = sourceTableRowHorizontals({ ...table, cells: slots }, { orderedCells: true });
  if (geometry.state !== 'resolved') throw Error(geometry.error);
  const cells = slots.slice(request.top * table.columns, request.bottom * table.columns);
  if (!Array.isArray(request.minimums) || request.minimums.length !== cells.length)
    throw Error('InvalidSourceTableCellHeightMinimums');
  const minimums = new Map();
  for (const minimum of request.minimums) {
    if (
      !minimum ||
      !uint(minimum.listNode) ||
      !uint(minimum.height) ||
      minimums.has(minimum.listNode)
    )
      throw Error('InvalidSourceTableCellHeightMinimums');
    minimums.set(minimum.listNode, minimum.height);
  }
  const heights = [];
  for (let row = request.top; row < request.bottom; row++) {
    const members = slots.slice(row * table.columns, (row + 1) * table.columns);
    const height = members[0]?.height;
    if (members.length !== table.columns || members.some((cell) => cell.height !== height))
      throw Error('ConflictingSourceTableRowHeights');
    heights.push(height);
  }
  const total = heights.reduce((sum, height) => sum + height, 0);
  const base = Math.floor(total / heights.length),
    remainder = total % heights.length;
  const edits = [];
  for (const cell of cells) {
    const height = base + Number(cell.row - request.top < remainder);
    if (!uint(minimums.get(cell.listNode))) throw Error('InvalidSourceTableCellHeightMinimums');
    if (height < minimums.get(cell.listNode)) throw Error('SourceTableCellHeightContentOverflow');
    if (cell.height !== height)
      edits.push({ section: table.section, listNode: cell.listNode, width: cell.width, height });
  }
  return edits;
}
