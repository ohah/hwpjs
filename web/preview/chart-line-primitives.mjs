import { chartCartesianData } from "./chart-cartesian-data.mjs";
import { createChartValueScale } from "./chart-value-scale.mjs";
import { chartLineValues } from "./chart-line-values.mjs";
import { chartMarkerPolicy, chartMarkerSettings } from "./chart-marker-policy.mjs";
import { chartBlankPolicy, chartLineBlankSeries } from "./chart-blank-policy.mjs";
const unavailable = (reason) => ({ state: "unavailable", reason });

/** Source blank policy with derived, non-editable zeroes; other style fidelity remains partial. */
export function chartLinePrimitives(display, plotNode) {
  const index = display.plots.findIndex((plot) => plot.node === plotNode);
  if (index < 0) return unavailable("MissingChartPlot");
  if (display.plots[index].kind !== "lineChart") return unavailable("UnsupportedLinePlotKind");
  const grouping = display.plot_settings[index].grouping?.value;
  if (!["standard", "stacked", "percentStacked"].includes(grouping))
    return unavailable("UnsupportedLineGrouping");
  const data = chartCartesianData(display, plotNode);
  if (data.state !== "ready") return data;
  const blanks = chartBlankPolicy(display);
  if (blanks.state !== "selected") return blanks;
  if (grouping !== "standard" && blanks.value !== "gap")
    return unavailable("UnsupportedGroupedLineBlankPolicy");
  const filled = chartLineBlankSeries(data.series, data.indices, blanks.value);
  if (filled.state !== "ready") return filled;
  const values = chartLineValues(filled.series, grouping);
  if (values.state !== "ready") return values;
  const scale = createChartValueScale(values.domain, data.valueAxis.scaling);
  if (scale.state !== "ready") return scale;
  const slots = new Map(data.indices.map((index, ordinal) => [index, ordinal]));
  const lines = [],
    markerWarnings = [];
  const settingsBySeries = chartMarkerSettings(display);
  for (const series of values.rows) {
    const marker = chartMarkerPolicy(settingsBySeries.get(series.series_node), false);
    if (marker.state !== "ready") return marker;
    markerWarnings.push(...marker.warnings);
    const paths = [];
    let previous = -2;
    for (const row of series.points) {
      const slot = slots.get(row.index),
        projected = scale.project(row.end_value);
      if (!Number.isFinite(projected)) return unavailable("InvalidChartCoordinate");
      const fraction = (slot + 0.5) / data.indices.length;
      const point = {
        ...row,
        x: data.categoryReversed ? 1 - fraction : fraction,
        y: 1 - projected,
      };
      if (!paths.length || (blanks.value !== "span" && previous !== slot - 1)) paths.push([]);
      paths.at(-1).push(point);
      previous = slot;
    }
    lines.push({ series_node: series.series_node, paths, marker });
  }
  return {
    state: "ready",
    exact: false,
    direction: "col",
    grouping,
    minimum: scale.minimum,
    maximum: scale.maximum,
    value_reversed: scale.reversed,
    category_reversed: data.categoryReversed,
    axes_hidden: data.axesHidden,
    categories: data.categories,
    value_ticks: scale.ticks(),
    legend: data.legend,
    lines,
    blank_policy: blanks.value,
    warnings: [
      "PreviewStraightLines",
      ...blanks.warnings,
      ...new Set(markerWarnings),
      "SourceStylesNotApplied",
      ...(grouping !== "standard" ? ["PreviewAlgebraicStacks"] : []),
      ...(grouping === "percentStacked" ? ["PreviewAbsolutePercentTotal"] : []),
    ],
  };
}
