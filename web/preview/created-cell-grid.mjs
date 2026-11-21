import { validateCreatedCellGeometry } from '../../js/created-cell-geometry.mjs';
import { hwpUnitsToPixels } from './table-grid.mjs';
export function createdCellGrid(table, { x, y, minRow = 0, contentSize = () => ({ height: 0 }) }) {
  validateCreatedCellGeometry(table);
  if (![x, y, minRow].every(Number.isFinite) || minRow < 0)
    throw Error('InvalidCreatedCellGeometry');
  const cells = [],
    rows = [];
  let top = y;
  for (let row = 0; row < table.rows; row++) {
    let height = 0;
    for (let column = 0; column < table.columns; column++) {
      const cell = table.cells[row * table.columns + column],
        size = contentSize(cell);
      if (!Number.isFinite(size.height) || size.height < 0)
        throw Error('InvalidCreatedCellGeometry');
      const h = Math.max(hwpUnitsToPixels(cell.height), size.height, minRow);
      cells.push({
        x: x + hwpUnitsToPixels(cell.x),
        y: top,
        width: hwpUnitsToPixels(cell.width),
        height: h,
      });
      height = Math.max(height, h);
    }
    rows.push(height);
    top += height;
  }
  return { cells, rows, width: hwpUnitsToPixels(table.width), height: top - y };
}
