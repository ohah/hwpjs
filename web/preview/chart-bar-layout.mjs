import { chartCartesianData } from "./chart-cartesian-data.mjs";
import { createChartValueScale } from "./chart-value-scale.mjs";
import { chartBarSegments } from "./chart-bar-segments.mjs";
import { chartBarSpacing } from "./chart-bar-spacing.mjs";
const unavailable = reason => ({ state: "unavailable", reason });

/** Normalized plot coordinates. Source style/spacing and host layout remain separate. */
export function chartBarLayout(display, plotNode) {
  const index = display.plots.findIndex(plot => plot.node === plotNode);
  if (index < 0) return unavailable("MissingChartPlot");
  const plot = display.plots[index], settings = display.plot_settings[index];
  if (!["barChart", "bar3DChart"].includes(plot.kind)) return unavailable("UnsupportedBarPlotKind");
  const grouping = settings.grouping?.value;
  if (!["clustered", "stacked", "percentStacked"].includes(grouping)) return unavailable("UnsupportedBarGrouping");
  const direction = settings.direction?.value;
  if (!["bar", "col"].includes(direction)) return unavailable("MissingBarDirection");
  const data = chartCartesianData(display, plotNode);
  if (data.state !== "ready") return data;
  const { series, indices, categories, categoryReversed, axesHidden } = data;
  const segments = chartBarSegments(series, grouping);
  if (segments.state !== "ready") return segments;
  const scale = createChartValueScale(segments.domain, data.valueAxis.scaling);
  if (scale.state !== "ready") return scale;
  if (scale.logarithm !== null) return unavailable("UnsupportedLogBarBaseline");
  const project = value => scale.project(Math.max(scale.minimum, Math.min(scale.maximum, value)));
  const slots = new Map(indices.map((value, i) => [value, i]));
  const spacing = chartBarSpacing(settings, series.length, indices.length, grouping);
  if (spacing.state !== "ready") return spacing;
  const bars = [], band = spacing.band;
  for (const segment of segments.segments) {
    const baseline = project(segment.start), end = project(segment.end);
    if (!Number.isFinite(end) || !Number.isFinite(baseline)) return unavailable("InvalidChartCoordinate");
    let category = slots.get(segment.index) / indices.length + spacing.inset + segment.seriesOrdinal * spacing.advance;
    if (categoryReversed) category = 1 - category - band;
    const low = Math.min(baseline, end), span = Math.abs(end - baseline);
    bars.push({ kind: "bar", series_node: segment.series_node, index: segment.index, ordinal: segment.ordinal, value: segment.value, normalized_value: segment.normalized_value, start_value: segment.start, end_value: segment.end,
      rectangle: direction === "col" ? { x: category, y: 1 - low - span, width: band, height: span }
        : { x: low, y: 1 - category - band, width: span, height: band } });
  }
  return { state: "ready", exact: false, direction, grouping, minimum: scale.minimum, maximum: scale.maximum, value_reversed: scale.reversed, category_reversed: categoryReversed,
    categories, axes_hidden: axesHidden, value_ticks: scale.ticks(), legend: data.legend,
    spacing: { gap_width: spacing.gap_width, overlap: spacing.overlap, gap_width_defaulted: spacing.gap_width_defaulted, overlap_defaulted: spacing.overlap_defaulted },
    warnings: [...spacing.warnings, "SourceStylesNotApplied"], bars };
}
