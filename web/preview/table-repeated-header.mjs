import { tableRowBands } from './table-row-bands.mjs';

// Leading rows covered by title cells repeat; scattered body flags stay source metadata.
export function selectRepeatedTableHeader(table, rowHeights) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    table?.pagination?.repeat_header !== undefined &&
    typeof table.pagination.repeat_header !== 'boolean'
  )
    return fail('InvalidRepeatedTableHeader');
  if (table?.pagination?.repeat_header !== true) return { state: 'none' };
  if (
    !Number.isSafeInteger(table.rows) ||
    table.rows < 1 ||
    table.rows > 10000 ||
    !Array.isArray(table.cells) ||
    table.cells.length > 100000 ||
    !Array.isArray(rowHeights) ||
    rowHeights.length !== table.rows ||
    !Array.from(table.cells).every(
      (cell) =>
        cell &&
        Number.isSafeInteger(cell.row) &&
        cell.row >= 0 &&
        Number.isSafeInteger(cell.rowSpan) &&
        cell.rowSpan > 0 &&
        cell.row + cell.rowSpan <= table.rows &&
        (cell.sourceMargin?.header === undefined || typeof cell.sourceMargin.header === 'boolean'),
    )
  )
    return fail('InvalidRepeatedTableHeader');
  try {
    tableRowBands(table, rowHeights);
  } catch (error) {
    if (!(error instanceof RangeError) || error.message !== 'InvalidTableRowBands') throw error;
    return fail('InvalidRepeatedTableHeader');
  }
  const crossings = new Int32Array(table.rows + 1);
  for (const cell of table.cells)
    if (cell.sourceMargin?.header === true) {
      crossings[cell.row]++;
      crossings[cell.row + cell.rowSpan]--;
    }
  let active = 0,
    endRow = 0;
  while (endRow < table.rows) {
    active += crossings[endRow];
    if (active === 0) break;
    endRow++;
  }
  if (!endRow) return { state: 'none' };
  const cells = table.cells.flatMap((cell, index) => (cell.row < endRow ? [index] : []));
  if (cells.some((index) => table.cells[index].row + table.cells[index].rowSpan > endRow))
    return fail('UnsupportedMergedHeaderBoundary');
  const height = rowHeights.slice(0, endRow).reduce((sum, h) => sum + h, 0);
  if (!Number.isFinite(height) || height <= 0) return fail('InvalidRepeatedTableHeader');
  return { state: 'selected', endRow, height, cells };
}
