import { chartBarLayout } from './chart-bar-layout.mjs';
/** 2D dispatch stays explicit; shared layout never chooses a rendering kind. */
export function chartBarPrimitives(display, plotNode) {
  const plot = display.plots.find((plot) => plot.node === plotNode);
  if (!plot) return { state: 'unavailable', reason: 'MissingChartPlot' };
  if (plot.kind !== 'barChart') return { state: 'unavailable', reason: 'UnsupportedBarPlotKind' };
  return chartBarLayout(display, plotNode);
}
