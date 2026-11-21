/** Native projection v1 only; old uniform snapshots use their existing validator. */
export function validateCreatedCellGeometry(table) {
  const fail = () => {
    throw Error('InvalidCreatedCellGeometry');
  };
  const uint = (n) => Number.isInteger(n) && !Object.is(n, -0) && n >= 0 && n <= 0xffffffff;
  if (
    !table ||
    ![table.rows, table.columns, table.width, table.height].every((n) => uint(n) && n > 0) ||
    table.rows * table.columns > 100000 ||
    !Array.isArray(table.cells) ||
    table.cells.length !== table.rows * table.columns
  )
    return fail();
  let y = 0,
    extent = 0;
  for (let row = 0; row < table.rows; row++) {
    let x = 0,
      height = 0;
    for (let column = 0; column < table.columns; column++) {
      const cell = table.cells[row * table.columns + column];
      if (
        !cell ||
        ![cell.x, cell.y, cell.width, cell.height, cell.row, cell.column].every(uint) ||
        cell.row !== row ||
        cell.column !== column ||
        cell.x !== x ||
        cell.y !== y ||
        !cell.width ||
        !cell.height
      )
        return fail();
      x += cell.width;
      height = Math.max(height, cell.height);
      if (x > 0xffffffff) return fail();
    }
    extent = Math.max(extent, x);
    y += height;
    if (y > 0xffffffff) return fail();
  }
  if (extent !== table.width || y !== table.height) return fail();
  return table;
}
