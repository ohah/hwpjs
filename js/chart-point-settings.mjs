import { object, uint, field } from "./chart-display-fields.mjs";
/** Typed dPt ownership only; explicit idx is not an array offset. */
export function validChartPointSettings(values, series, occupied = null) {
  if (!Array.isArray(values)) return false;
  let previous = -1;
  for (const row of values) {
    if (!object(row) || !uint(row.node) || row.node <= previous || !series.has(row.series_node) ||
      series.get(row.series_node) !== row.plot_node || row.node <= row.series_node || typeof row.unparsed_children !== "boolean" ||
      !field(row.index, uint, row.node) || !field(row.explosion, uint, row.node)) return false;
    if (row.index !== null && row.explosion !== null && row.index.node === row.explosion.node) return false;
    occupied?.add(row.node);
    if (row.index !== null) occupied?.add(row.index.node);
    if (row.explosion !== null) occupied?.add(row.explosion.node);
    previous = row.node;
  }
  return true;
}
