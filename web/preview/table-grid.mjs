// Display-only minimum-size constraints, not an HWP page-layout engine.
export { hwpUnitPixels as hwpUnitsToPixels } from "./hwp-units.mjs";
import { hwpUnitPixels as hwpUnitsToPixels } from "./hwp-units.mjs";
import { sourceTableRowHorizontals as resolveSourceRows } from "./source-table-row-horizontals.mjs";
import { tableSourceCellMinimumHeight } from "./table-source-cell-size.mjs";

export function tableGrid(table, { x = 20, y = 0, minColumn = 40, minRow = 28, contentSize = () => ({ width: 0, height: 0 }), columnWidths, sourceRowHorizontals = false } = {}) {
  const positive = value => Number.isFinite(value) && value > 0;
  if (![x, y].every(Number.isFinite) || !positive(minColumn) || !Number.isFinite(minRow) || minRow < 0 ||
      !Number.isInteger(table.rows) || !Number.isInteger(table.columns) ||
      table.rows < 1 || table.columns < 1 || table.rows > 10000 || table.columns > 10000 ||
      table.cells.length > 100000) throw new RangeError("InvalidTableGrid");
  if (columnWidths !== undefined && (!Array.isArray(columnWidths) || columnWidths.length !== table.columns || Array.from(columnWidths).some(value => !positive(value)))) throw new RangeError("InvalidTableGrid");
  if (typeof sourceRowHorizontals !== "boolean" || sourceRowHorizontals && columnWidths !== undefined) throw new RangeError("InvalidTableGrid");
  const sourceRows = sourceRowHorizontals ? resolveSourceRows(table) : null;
  if (sourceRows && sourceRows.state !== "resolved") throw new RangeError(sourceRows.error);
  const columns = columnWidths?.slice() ?? Array(table.columns).fill(minColumn), rows = Array(table.rows).fill(minRow);
  const sizes = table.cells.map(cell => {
    for (const [start, span, bound] of [[cell.row, cell.rowSpan, table.rows], [cell.column, cell.columnSpan, table.columns]]) {
      if (!Number.isInteger(start) || !Number.isInteger(span) || start < 0 || span < 1 || start > bound - span) throw new RangeError("InvalidTableGrid");
    }
    if (![cell.width, cell.height].every(value => value === null || (Number.isInteger(value) && value >= 0 && value <= 0xffffffff))) throw new RangeError("InvalidTableGrid");
    const size = contentSize(cell);
    if (![size.width, size.height].every(value => Number.isFinite(value) && value >= 0)) throw new RangeError("InvalidTableGrid");
    return { cell, width: Math.max(cell.width === null ? 0 : hwpUnitsToPixels(cell.width), size.width), height: Math.max(tableSourceCellMinimumHeight(table, cell), size.height) };
  });
  const grow = (tracks, start, span, minimum) => {
    let current = 0;
    for (let i = start; i < start + span; i++) current += tracks[i];
    const extra = Math.max(0, minimum - current) / span;
    for (let i = start; i < start + span; i++) tracks[i] += extra;
  };
  // Narrow spans first; canonical ordering makes the projection independent
  // of source list order. Conflicting dimensions grow rather than clip text.
  if (sourceRows) {
    for (const [index, { width }] of sizes.entries()) if (hwpUnitsToPixels(sourceRows.cells[index].width) + 1e-8 < width) throw new RangeError("InvalidTableGrid");
  } else if (columnWidths === undefined) {
    for (const { cell, width } of [...sizes].sort((a, b) => a.cell.columnSpan - b.cell.columnSpan || a.cell.column - b.cell.column || a.width - b.width)) grow(columns, cell.column, cell.columnSpan, width);
  } else {
    for (const { cell, width } of sizes) if (columns.slice(cell.column, cell.column + cell.columnSpan).reduce((sum, value) => sum + value, 0) + 1e-8 < width) throw new RangeError("InvalidTableGrid");
  }
  for (const { cell, height } of [...sizes].sort((a, b) => a.cell.rowSpan - b.cell.rowSpan || a.cell.row - b.cell.row || a.height - b.height)) grow(rows, cell.row, cell.rowSpan, height);
  const offsets = (tracks, origin) => tracks.reduce((out, size) => { out.push(out.at(-1) + size); return out; }, [origin]);
  const xs = offsets(columns, x), ys = offsets(rows, y);
  if (![...xs, ...ys].every(Number.isFinite)) throw new RangeError("InvalidTableGrid");
  const result = { width: sourceRows ? hwpUnitsToPixels(sourceRows.width) : columns.reduce((sum, value) => sum + value, 0), height: rows.reduce((sum, value) => sum + value, 0), columns: sourceRows ? null : columns, rows, cells: sizes.map(({ cell }, index) => ({
    listNode: cell.listNode, x: sourceRows ? x + hwpUnitsToPixels(sourceRows.cells[index].x) : xs[cell.column], y: ys[cell.row],
    // Dimensions belong to tracks, not subtraction of translated coordinates.
    width: sourceRows ? hwpUnitsToPixels(sourceRows.cells[index].width) : columns.slice(cell.column, cell.column + cell.columnSpan).reduce((sum, value) => sum + value, 0),
    height: rows.slice(cell.row, cell.row + cell.rowSpan).reduce((sum, value) => sum + value, 0),
  })) };
  if (result.cells.some(cell => ![cell.x, cell.y, cell.x + cell.width, cell.y + cell.height].every(Number.isFinite))) throw new RangeError("InvalidTableGrid");
  return result;
}
