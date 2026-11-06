import { MAX_CELL_BORDER_EDITS } from './cell-border-batch.mjs';

const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
// Signed endpoint cancellation proves rectangular coverage without expanding spans.
// Internal shared boundaries cancel, including a long merged edge against short edges.
function covers(cells, bounds) {
  const flux = new Map();
  const add = (axis, line, point, delta) => {
    const key = `${axis}:${line}:${point}`,
      next = (flux.get(key) ?? 0) + delta;
    if (next) flux.set(key, next);
    else flux.delete(key);
  };
  for (const cell of cells) {
    const bottom = cell.row + cell.rowSpan,
      right = cell.column + cell.columnSpan;
    add('v', cell.column, cell.row, -1);
    add('v', cell.column, bottom, 1);
    add('v', right, cell.row, 1);
    add('v', right, bottom, -1);
    add('h', cell.row, cell.column, -1);
    add('h', cell.row, right, 1);
    add('h', bottom, cell.column, 1);
    add('h', bottom, right, -1);
  }
  const { rowStart: r0, rowEnd: r1, columnStart: c0, columnEnd: c1 } = bounds;
  const expected = [
    ['v', c0, r0, -1],
    ['v', c0, r1, 1],
    ['v', c1, r0, 1],
    ['v', c1, r1, -1],
    ['h', r0, c0, -1],
    ['h', r0, c1, 1],
    ['h', r1, c0, 1],
    ['h', r1, c1, -1],
  ];
  return (
    flux.size === 8 &&
    expected.every(([axis, line, point, value]) => flux.get(`${axis}:${line}:${point}`) === value)
  );
}
export function completeTableRegionRequest(table, request) {
  return !(
    !request ||
    ![request.section, request.tableNode, request.listNode].every(uint) ||
    !['cell', 'range', 'table'].includes(request.mode) ||
    !table ||
    table.partial !== false ||
    table.section !== request.section ||
    table.tableNode !== request.tableNode ||
    !Array.isArray(table.cells) ||
    !table.cells.length ||
    table.cells.length > MAX_CELL_BORDER_EDITS
  );
}
// Linear admission and selected owner geometry; no dense row*column expansion.
export function tableCellRegion(table, request) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (!completeTableRegionRequest(table, request)) return fail('CompleteOriginalTableRequired');
  const owners = new Set();
  let selected,
    minRow = Infinity,
    minColumn = Infinity,
    maxRow = 0,
    maxColumn = 0;
  for (const cell of table.cells) {
    if (
      !cell ||
      ![cell.listNode, cell.row, cell.column, cell.rowSpan, cell.columnSpan].every(uint) ||
      !cell.rowSpan ||
      !cell.columnSpan ||
      cell.created ||
      owners.has(cell.listNode)
    )
      return fail('InvalidOriginalTableCell');
    owners.add(cell.listNode);
    const bottom = cell.row + cell.rowSpan,
      right = cell.column + cell.columnSpan;
    if (!uint(bottom) || !uint(right)) return fail('InvalidOriginalTableCell');
    if (cell.listNode === request.listNode) selected = cell;
    minRow = Math.min(minRow, cell.row);
    minColumn = Math.min(minColumn, cell.column);
    maxRow = Math.max(maxRow, bottom);
    maxColumn = Math.max(maxColumn, right);
  }
  if (!selected) return fail('OriginalTableCellRequired');
  if (
    !covers(table.cells, {
      rowStart: minRow,
      rowEnd: maxRow,
      columnStart: minColumn,
      columnEnd: maxColumn,
    })
  )
    return fail('UnsupportedTableCoverage');
  let bounds = { rowStart: minRow, rowEnd: maxRow, columnStart: minColumn, columnEnd: maxColumn };
  if (request.mode === 'cell')
    bounds = {
      rowStart: selected.row,
      rowEnd: selected.row + selected.rowSpan,
      columnStart: selected.column,
      columnEnd: selected.column + selected.columnSpan,
    };
  if (request.mode === 'range') {
    const range = request.range;
    if (
      !range ||
      ![range.rowStart, range.rowEnd, range.columnStart, range.columnEnd].every(uint) ||
      range.rowStart >= range.rowEnd ||
      range.columnStart >= range.columnEnd ||
      range.rowStart < minRow ||
      range.rowEnd > maxRow ||
      range.columnStart < minColumn ||
      range.columnEnd > maxColumn
    )
      return fail('InvalidCellRange');
    bounds = {
      rowStart: range.rowStart,
      rowEnd: range.rowEnd,
      columnStart: range.columnStart,
      columnEnd: range.columnEnd,
    };
  }
  const selectedCells = [];
  for (const cell of table.cells) {
    const bottom = cell.row + cell.rowSpan,
      right = cell.column + cell.columnSpan;
    if (
      bottom <= bounds.rowStart ||
      cell.row >= bounds.rowEnd ||
      right <= bounds.columnStart ||
      cell.column >= bounds.columnEnd
    )
      continue;
    if (
      cell.row < bounds.rowStart ||
      bottom > bounds.rowEnd ||
      cell.column < bounds.columnStart ||
      right > bounds.columnEnd
    )
      return fail('MergedCellBoundaryUnsupported');
    if (cell.protected) return fail('ProtectedCell');
    selectedCells.push(cell);
  }
  if (!covers(selectedCells, bounds)) return fail('UnsupportedCellRangeCoverage');
  return {
    state: 'planned',
    cells: Object.freeze(
      selectedCells.map((cell) =>
        Object.freeze({
          listNode: cell.listNode,
          row: cell.row,
          column: cell.column,
          rowSpan: cell.rowSpan,
          columnSpan: cell.columnSpan,
        }),
      ),
    ),
    bounds: Object.freeze(bounds),
  };
}
