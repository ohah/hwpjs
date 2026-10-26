import { chartPointGroupLabel } from './chart-point-label.mjs';
const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
// Display projection only. Every cell retains native edit ordinals, not row offsets.
export function chartPointGridModel(chart) {
  const points = chart?.values?.points ?? [];
  if (!Array.isArray(points)) throw new Error('InvalidChartGridPoints');
  const columns = [],
    columnKeys = new Map(),
    byIndex = new Map(),
    locations = new Map();
  for (const [ordinal, point] of points.entries()) {
    if (
      !point ||
      !uint(point.index) ||
      !uint(point.cache_node) ||
      (point.level_node != null && !uint(point.level_node))
    )
      throw new Error('InvalidChartGridPoint');
    const binding = chart.bindings?.[ordinal];
    const owner = binding?.point === ordinal ? binding : null;
    const key = JSON.stringify([
      owner?.plot_node ?? null,
      owner?.series_node ?? null,
      owner?.role_node ?? null,
      point.cache_node,
      point.level_node ?? null,
    ]);
    let column = columnKeys.get(key);
    if (column === undefined) {
      column = columns.length;
      columnKeys.set(key, column);
      columns.push({
        label: `${chartPointGroupLabel(chart, point, ordinal)} · 캐시 ${point.cache_node}`,
      });
    }
    let row = byIndex.get(point.index);
    if (!row) {
      row = { index: point.index, cells: new Map() };
      byIndex.set(point.index, row);
    }
    const cell = row.cells.get(column) ?? [];
    cell.push(ordinal);
    row.cells.set(column, cell);
    locations.set(ordinal, { index: point.index, column });
  }
  const rows = [...byIndex.values()].sort((a, b) => a.index - b.index);
  const rowNumbers = new Map(rows.map((row, index) => [row.index, index]));
  for (const location of locations.values()) location.row = rowNumbers.get(location.index);
  return { columns, rows, locations };
}
