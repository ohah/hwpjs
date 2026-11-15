import { chartLinePrimitives } from './chart-line-primitives.mjs';
import { projectFamily3D } from './chart-family-3d.mjs';
import { unavailable } from './chart-family-geometry.mjs';
export function chartLine3DPrimitives(display, node) {
  const plot = display.plots.find((p) => p.node === node);
  if (!plot) return unavailable('MissingChartPlot');
  if (plot.kind !== 'line3DChart') return unavailable('UnsupportedLine3DPlotKind');
  // Reuse the owned category/stack/blank projection; only its 2D kind admission changes.
  const input = {
    ...display,
    plots: display.plots.map((p) => (p.node === node ? { ...p, kind: 'lineChart' } : p)),
  };
  return projectFamily3D(display, node, chartLinePrimitives(input, node), true);
}
