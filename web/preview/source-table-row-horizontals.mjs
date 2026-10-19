// 논리 열 주소는 공유하되 행마다 다른 물리 셀 경계를 보존합니다. 단위는 원본 HU입니다.
export function sourceTableRowHorizontals(table, { maxCoveredCells = 1000000 } = {}) {
  const fail = error => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(table?.rows) || table.rows < 1 || table.rows > 10000
    || !Number.isSafeInteger(table.columns) || table.columns < 1 || table.columns > 10000
    || !Array.isArray(table.cells) || !table.cells.length || table.cells.length > 100000
    || !Number.isSafeInteger(maxCoveredCells) || maxCoveredCells < 1) return fail("InvalidSourceTableRowHorizontals");
  if (table.pagination?.cell_spacing !== undefined && table.pagination.cell_spacing !== 0) return fail("UnsupportedSourceTableRowSpacing");
  const rows = Array.from({ length: table.rows }, () => []), ids = new Set();
  let work = 0;
  for (const cell of table.cells) {
    if (!cell || !Number.isSafeInteger(cell.listNode) || cell.listNode < 0 || ids.has(cell.listNode)
      || !Number.isSafeInteger(cell.row) || !Number.isSafeInteger(cell.rowSpan) || cell.row < 0 || cell.rowSpan < 1 || cell.row > table.rows - cell.rowSpan
      || !Number.isSafeInteger(cell.column) || !Number.isSafeInteger(cell.columnSpan) || cell.column < 0 || cell.columnSpan < 1 || cell.column > table.columns - cell.columnSpan
      || !Number.isSafeInteger(cell.width) || cell.width <= 0 || cell.width > 0xffffffff) return fail("InvalidSourceTableRowHorizontals");
    ids.add(cell.listNode);
    work += cell.rowSpan;
    if (work > maxCoveredCells) return fail("SourceTableRowHorizontalLimit");
    for (let row = cell.row; row < cell.row + cell.rowSpan; row++) rows[row].push(cell);
  }
  const boxes = new Map(), rowWidths = [];
  for (const [row, cells] of rows.entries()) {
    cells.sort((a, b) => a.column - b.column);
    let column = 0, x = 0;
    for (const cell of cells) {
      if (cell.column !== column) return { ...fail("IncompleteSourceTableRowCoverage"), row, column };
      const end = x + cell.width;
      if (!Number.isSafeInteger(end)) return fail("InvalidSourceTableRowHorizontals");
      const previous = boxes.get(cell.listNode);
      if (previous && (previous.x !== x || previous.width !== cell.width)) return { ...fail("ConflictingSourceSpanningCellPosition"), row, listNode: cell.listNode };
      boxes.set(cell.listNode, { listNode: cell.listNode, x, width: cell.width });
      x = end; column += cell.columnSpan;
    }
    if (column !== table.columns) return { ...fail("IncompleteSourceTableRowCoverage"), row, column };
    rowWidths.push(x);
  }
  return { state: "resolved", cells: table.cells.map(cell => boxes.get(cell.listNode)), rowWidths,
    width: Math.max(...rowWidths), evidence: { kind: "source-row-cell-boundaries" } };
}
