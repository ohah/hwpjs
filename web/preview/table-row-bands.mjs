/** Indivisible row bands; cell-interior splitting and page policy are separate. */
export function tableRowBands(table, rowHeights) {
  if (!table) throw new RangeError("InvalidTableRowBands");
  if (!Number.isInteger(table.rows) || table.rows < 1 || table.rows > 10000 || !Array.isArray(rowHeights) || rowHeights.length !== table.rows || rowHeights.some(height => !Number.isFinite(height) || height < 0) || !Array.isArray(table.cells) || table.cells.length > 100000) throw new RangeError("InvalidTableRowBands");
  const crossings = new Int32Array(table.rows + 1);
  for (const cell of table.cells) {
    if (!cell) throw new RangeError("InvalidTableRowBands");
    if (!Number.isInteger(cell.row) || !Number.isInteger(cell.rowSpan) || cell.row < 0 || cell.rowSpan < 1 || cell.row > table.rows - cell.rowSpan) throw new RangeError("InvalidTableRowBands");
    if (cell.rowSpan > 1) {
      crossings[cell.row + 1]++;
      crossings[cell.row + cell.rowSpan]--;
    }
  }
  const bands = [], owner = new Uint32Array(table.rows);
  let active = 0, start = 0, height = 0, offset = 0;
  for (let row = 0; row < table.rows; row++) {
    if (row > 0) active += crossings[row];
    if (row > 0 && active === 0) {
      if (height <= 0) throw new RangeError("InvalidTableRowBands");
      bands.push({ startRow: start, endRow: row, offset, height, cells: [] });
      offset += height; height = 0; start = row;
    }
    owner[row] = bands.length;
    height += rowHeights[row];
    if (!Number.isFinite(height) || !Number.isFinite(offset + height)) throw new RangeError("InvalidTableRowBands");
  }
  if (height <= 0) throw new RangeError("InvalidTableRowBands");
  bands.push({ startRow: start, endRow: table.rows, offset, height, cells: [] });
  table.cells.forEach((cell, index) => bands[owner[cell.row]].cells.push(index));
  return bands;
}
