import { object, uint, field, oneOf } from './chart-display-fields.mjs';
const symbols = [
  'auto',
  'circle',
  'dash',
  'diamond',
  'dot',
  'none',
  'picture',
  'plus',
  'square',
  'star',
  'triangle',
  'x',
];
/** Wire ownership validation only; native code owns XML and absent defaults. */
export function validChartSeriesSettings(values, plots, series, occupied = null) {
  if (!Array.isArray(values) || values.length !== series.size) return false;
  let index = 0;
  for (const [node, plotNode] of series) {
    const row = values[index++],
      kind = plots.get(plotNode)?.kind;
    if (
      !object(row) ||
      row.series_node !== node ||
      row.plot_node !== plotNode ||
      !field(row.smooth, (v) => typeof v === 'boolean', node)
    )
      return false;
    if (!field(row.index, uint, node) || !field(row.order, uint, node)) return false;
    const line = ['lineChart', 'line3DChart', 'stockChart', 'scatterChart'].includes(kind);
    if (row.smooth !== null && !line) return false;
    if (!field(row.explosion, uint, node)) return false;
    if (
      row.explosion !== null &&
      !['pieChart', 'pie3DChart', 'ofPieChart', 'doughnutChart'].includes(kind)
    )
      return false;
    const marker = row.marker;
    if (
      marker !== null &&
      ((!line && kind !== 'radarChart') ||
        !object(marker) ||
        !uint(marker.node) ||
        marker.node <= node ||
        !field(marker.symbol, oneOf(symbols), marker.node) ||
        !field(marker.size, (v) => uint(v) && v >= 2 && v <= 72, marker.node))
    )
      return false;
    const leaves = [
      row.index,
      row.order,
      row.smooth,
      row.explosion,
      ...(marker ? [marker, marker.symbol, marker.size] : []),
    ].filter((value) => value !== null);
    const stroke = row.stroke,
      strokeNodes = [];
    if (stroke !== undefined && stroke !== null) {
      if (
        !object(stroke) ||
        !uint(stroke.node) ||
        stroke.node <= node ||
        !(
          stroke.no_fill_node === null ||
          (uint(stroke.no_fill_node) && stroke.no_fill_node > stroke.node)
        )
      )
        return false;
      strokeNodes.push(stroke.node);
      if (stroke.no_fill_node !== null) strokeNodes.push(stroke.no_fill_node);
    }
    const identities = [...leaves.map((value) => value.node), ...strokeNodes];
    if (new Set(identities).size !== identities.length) return false;
    for (const leaf of leaves) occupied?.add(leaf.node);
  }
  return true;
}
