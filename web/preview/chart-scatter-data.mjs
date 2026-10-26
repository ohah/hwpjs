import { chartPlotInput, chartAxisHidden } from "./chart-plot-input.mjs";
import { createChartValueScale } from "./chart-value-scale.mjs";
import { chartBlankPolicy } from "./chart-blank-policy.mjs";
const unavailable = (reason) => ({ state: "unavailable", reason });

/** Native-indexed XY data only; plot/series curve and marker paint is separate. */
export function chartScatterData(display, plotNode) {
  const plot = display.plots.find((plot) => plot.node === plotNode);
  if (!plot) return unavailable("MissingChartPlot");
  if (plot.kind !== "scatterChart") return unavailable("UnsupportedScatterPlotKind");
  const input = chartPlotInput(display, plotNode);
  if (input.state !== "ready") return input;
  const blanks = chartBlankPolicy(display);
  if (blanks.state !== "selected") return blanks;
  if (blanks.value === "zero") return unavailable("UnsupportedScatterZeroBlanks");
  const style = display.plot_settings[input.index].scatter_style?.value;
  if (!["line", "lineMarker", "marker", "smooth", "smoothMarker"].includes(style))
    return unavailable("MissingScatterStyle");
  if (input.axes.length !== 2 || input.axes.some((axis) => axis.kind !== "valAx"))
    return unavailable("AmbiguousScatterAxes");
  const horizontal = input.axes.filter((axis) => ["b", "t"].includes(axis.position?.value));
  const vertical = input.axes.filter((axis) => ["l", "r"].includes(axis.position?.value));
  if (horizontal.length !== 1 || vertical.length !== 1)
    return unavailable("AmbiguousScatterAxisPosition");
  const rows = [],
    xValues = [],
    yValues = [];
  let missing = 0;
  for (const source of input.series) {
    if (["category", "value", "bubble_size"].some((role) => source.roles[role].length))
      return unavailable("UnsupportedScatterRoles");
    const points = [];
    let gap = true;
    for (const row of source.points) {
      if ((row.x && row.x.number?.kind !== "finite") || (row.y && row.y.number?.kind !== "finite"))
        return unavailable("UnsupportedScatterData");
      if (!row.x || !row.y) {
        missing++;
        if (blanks.value !== "span") gap = true;
        continue;
      }
      const x = row.x.number.value,
        y = row.y.number.value;
      points.push({
        index: row.index,
        x_ordinal: row.x.ordinal,
        y_ordinal: row.y.ordinal,
        x_value: x,
        y_value: y,
        break_before: gap,
      });
      gap = false;
      xValues.push(x);
      yValues.push(y);
    }
    rows.push({ series_node: source.node, points });
  }
  if (!xValues.length) return unavailable("EmptyScatterPairs");
  const xScale = createChartValueScale(xValues, horizontal[0].scaling),
    yScale = createChartValueScale(yValues, vertical[0].scaling);
  if (xScale.state !== "ready") return xScale;
  if (yScale.state !== "ready") return yScale;
  for (const row of rows)
    for (const point of row.points) {
      const x = xScale.project(point.x_value),
        y = yScale.project(point.y_value);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return unavailable("InvalidChartCoordinate");
      point.x = x;
      point.y = 1 - y;
    }
  return {
    state: "ready",
    exact: false,
    style,
    rows,
    missing_pairs: missing,
    legend: input.legend,
    blank_policy: blanks.value,
    blank_policy_warnings: blanks.warnings,
    x_axis: {
      node: horizontal[0].node,
      minimum: xScale.minimum,
      maximum: xScale.maximum,
      hidden: chartAxisHidden(horizontal[0]),
      ticks: xScale.ticks(),
    },
    y_axis: {
      node: vertical[0].node,
      minimum: yScale.minimum,
      maximum: yScale.maximum,
      hidden: chartAxisHidden(vertical[0]),
      ticks: yScale.ticks(),
    },
  };
}
