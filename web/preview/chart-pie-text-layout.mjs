import { chartPreviewLegendLayout } from "./chart-preview-legend-layout.mjs";

/** Categories are pie legend entries, never fake Cartesian axes. */
export function chartPieTextLayout(item, measure) {
  const pie = item.primitives.pie ?? item.primitives.pie_3d?.pie;
  const rows = pie
    ? pie.slices.map((slice) => ({
        series_node: pie.series_node,
        color_key: slice.color_index,
        text: slice.category,
      }))
    : item.primitives.legend;
  const legend = chartPreviewLegendLayout(rows, item.width - 16, 8, measure);
  if (legend.state !== "ready") return legend;
  const plot = { x: 8, y: 10, width: item.width - 16, height: item.height - 20 - legend.height };
  if (![plot.width, plot.height].every(Number.isFinite) || plot.width < 24 || plot.height < 24)
    return { state: "unavailable", reason: "ChartPreviewTextSpaceUnavailable" };
  for (const entry of legend.legend) entry.y = plot.y + plot.height + 4 + entry.line * 18;
  return {
    state: "ready",
    plot,
    ticks: [],
    categories: [],
    legend: legend.legend,
    axes_hidden: { value: true, category: true },
    direction: "pie",
    summary: { categoryOmitted: 0, legendOmitted: legend.omitted, shortened: legend.shortened },
  };
}
