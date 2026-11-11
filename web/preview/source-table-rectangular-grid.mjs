/** Bounded nonspanning source cells indexed once in physical row/column order. */
export function orderedSourceTableCells(table, invalid = 'InvalidSourceTableCellGrid') {
  const uint = (value) => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
  const count = table?.rows * table?.columns;
  if (
    !uint(table?.rows) ||
    !uint(table?.columns) ||
    table.rows < 1 ||
    table.columns < 1 ||
    !Number.isSafeInteger(count) ||
    count > 4096 ||
    !Array.isArray(table.cells) ||
    table.cells.length !== count
  )
    throw Error(invalid);
  const slots = Array.from({ length: count });
  for (const cell of table.cells) {
    if (
      !cell ||
      !uint(cell.row) ||
      !uint(cell.column) ||
      cell.row >= table.rows ||
      cell.column >= table.columns ||
      cell.rowSpan !== 1 ||
      cell.columnSpan !== 1
    )
      throw Error(invalid);
    const index = cell.row * table.columns + cell.column;
    if (slots[index]) throw Error(invalid);
    slots[index] = cell;
  }
  return slots;
}
