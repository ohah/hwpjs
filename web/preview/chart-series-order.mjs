const unavailable = (reason) => ({ state: 'unavailable', reason });

/** Explicit source identity/order only. Never substitute XML position or name. */
export function chartSeriesOrder(display, plotNode) {
  const plot = display.plots.find((row) => row.node === plotNode);
  if (!plot) return unavailable('MissingChartPlot');
  const indices = new Set(),
    orders = new Set(),
    rows = [];
  const settings = new Map();
  for (const row of display.series_settings)
    settings.set(row.series_node, settings.has(row.series_node) ? null : row);
  for (const node of plot.series_nodes) {
    const row = settings.get(node);
    if (!row || row.plot_node !== plotNode) return unavailable('AmbiguousChartSeriesIdentity');
    const index = row.index?.value,
      order = row.order?.value;
    if (
      ![index, order].every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff)
    )
      return unavailable('MissingChartSeriesIdentity');
    if (indices.has(index) || orders.has(order)) return unavailable('DuplicateChartSeriesIdentity');
    indices.add(index);
    orders.add(order);
    rows.push({ series_node: node, index, order });
  }
  if (!rows.length) return unavailable('EmptyChartSeries');
  rows.sort((a, b) => a.order - b.order);
  return { state: 'ready', rows };
}
