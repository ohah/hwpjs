import { projectChartSeries } from './chart-series-data.mjs';
const unavailable = (reason) => ({ state: 'unavailable', reason });
export const chartAxisHidden = (axis) => axis.deleted != null && axis.deleted.value !== false;

/** Common native-owner projection; no chart-kind axis or geometry defaults. */
export function chartSeriesInput(display, plotNode) {
  const index = display.plots.findIndex((plot) => plot.node === plotNode);
  if (index < 0) return unavailable('MissingChartPlot');
  const projection = projectChartSeries(display),
    knownPlots = new Set(display.plots.map((plot) => plot.node));
  if (
    projection.diagnostics.some((diagnostic) => {
      const owner = display.bindings[diagnostic.ordinal]?.plot_node;
      return owner === plotNode || !knownPlots.has(owner);
    })
  )
    return unavailable('UnclassifiedChartPoints');
  const series = projection.plots[index].series;
  if (!series.length) return unavailable('EmptyChartSeries');
  if (series.some((row) => row.diagnostics.length)) return unavailable('UnsupportedSeriesData');
  return {
    state: 'ready',
    index,
    series,
    legend: series.map((row) => ({ series_node: row.node, text: row.name?.text ?? null })),
  };
}

export function chartPlotInput(display, plotNode) {
  const index = display.plots.findIndex((plot) => plot.node === plotNode);
  if (index < 0) return unavailable('MissingChartPlot');
  const references = display.axis_links.filter((link) => link.plot_node === plotNode);
  if (!references.length || references.some((link) => link.target.status !== 'resolved'))
    return unavailable('UnresolvedChartAxis');
  const axes = references.map((link) =>
    display.axes.find((axis) => axis.node === link.target.node),
  );
  if (axes.some((axis) => !axis)) return unavailable('UnresolvedChartAxis');
  const input = chartSeriesInput(display, plotNode);
  return input.state === 'ready' ? { ...input, axes } : input;
}
