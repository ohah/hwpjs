import { chartPieLayout } from './chart-pie-layout.mjs';
export function chartPiePrimitives(display, plotNode) {
  const plot = display.plots.find((plot) => plot.node === plotNode);
  if (!plot) return { state: 'unavailable', reason: 'MissingChartPlot' };
  if (plot.kind !== 'pieChart') return { state: 'unavailable', reason: 'UnsupportedPiePlotKind' };
  return chartPieLayout(display, plotNode);
}
