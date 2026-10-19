// 원본 HU 폭을 열 경계 차이 제약으로 복원합니다. 부족한 경계는 보정하지 않습니다.
export function sourceTableColumns(table) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(table?.columns) || table.columns < 1 || table.columns > 10000
    || !Array.isArray(table.cells) || table.cells.length > 100000) return unavailable("InvalidSourceTableColumns");
  const edges = Array.from({ length: table.columns + 1 }, () => []);
  for (const cell of table.cells) {
    if (!cell || !Number.isSafeInteger(cell.column) || !Number.isSafeInteger(cell.columnSpan)
      || cell.column < 0 || cell.columnSpan < 1 || cell.column > table.columns - cell.columnSpan
      || !(cell.width === null || Number.isSafeInteger(cell.width) && cell.width >= 0 && cell.width <= 0xffffffff)) return unavailable("InvalidSourceTableColumns");
    if (cell.width === null) continue;
    const end = cell.column + cell.columnSpan;
    edges[cell.column].push({ end, delta: cell.width });
    edges[end].push({ end: cell.column, delta: -cell.width });
  }
  for (const list of edges) list.sort((a, b) => a.end - b.end || a.delta - b.delta);
  const positions = Array(table.columns + 1).fill(null), pending = [0];
  positions[0] = 0;
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const start = pending[cursor];
    for (const edge of edges[start]) {
      const expected = positions[start] + edge.delta;
      if (!Number.isSafeInteger(expected)) return unavailable("InvalidSourceTableColumns");
      if (positions[edge.end] === null) { positions[edge.end] = expected; pending.push(edge.end); }
      else if (positions[edge.end] !== expected) return { ...unavailable("ConflictingSourceTableColumns"),
        start, end: edge.end, expected, actual: positions[edge.end] };
    }
  }
  const missing = positions.flatMap((value, index) => value === null ? [index] : []);
  if (missing.length) return { ...unavailable("UnderdeterminedSourceTableColumns"), missing };
  const columns = positions.slice(1).map((position, index) => position - positions[index]);
  if (columns.some(width => width <= 0)) return { ...unavailable("InvalidSourceTableColumns"), reason: "NonPositiveSourceColumnSolution" };
  return { state: "resolved", columns, positions, width: positions.at(-1) };
}
