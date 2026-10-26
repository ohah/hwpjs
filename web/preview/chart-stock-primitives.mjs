import { chartStockData } from "./chart-stock-data.mjs";
import { createChartValueScale } from "./chart-value-scale.mjs";
import { chartMarkerPolicy, chartMarkerSettings } from "./chart-marker-policy.mjs";
const unavailable = (reason) => ({ state: "unavailable", reason });

/** Source high/low extrema and ordered first/last bodies, not inferred price names. */
export function chartStockPrimitives(display, plotNode) {
  const data = chartStockData(display, plotNode);
  if (data.state !== "source-rows") return data;
  if (data.ordering.state !== "ready") return data.ordering;
  const settings = data.settings;
  if (!settings) return unavailable("MissingStockSettings");
  if (settings.up_down_node !== null && data.empty_value_series_nodes.length)
    return unavailable("UnsupportedStockBlankSeriesWithBodies");
  const warnings = ["PreviewStockEndpoints", "SourceStylesNotApplied", ...data.blank_warnings],
    highLow = [],
    bodies = [],
    lines = [];
  let gap = null;
  if (settings.up_down_node !== null) {
    if (settings.gap_width?.value === null) return unavailable("MissingStockGapValue");
    gap = settings.gap_width?.value ?? 150;
    if (!Number.isInteger(gap) || gap < 0 || gap > 500) return unavailable("InvalidStockGapValue");
    if (settings.gap_width === null) warnings.push("PreviewDefaultStockGap");
  }
  const scale = createChartValueScale(
    data.rows.flatMap((row) => row.values.map((point) => point.value)),
    data.value_scaling,
    { includeZero: false },
  );
  if (scale.state !== "ready") return scale;
  const seriesSettings = chartMarkerSettings(display),
    markers = new Map();
  const sourceLines = new Map();
  for (const row of data.ordering.rows) {
    const setting = seriesSettings.get(row.series_node);
    if (setting?.stroke === undefined) {
      if (data.series.length > 4) return unavailable("MissingStockStrokeSettings");
      warnings.push("SourceStockSeriesLinesNotApplied");
    }
    const visible = setting?.stroke !== undefined && setting.stroke?.no_fill_node == null;
    sourceLines.set(row.series_node, visible);
    const marker = chartMarkerPolicy(seriesSettings.get(row.series_node), false);
    if (marker.state !== "ready") return marker;
    markers.set(row.series_node, marker);
    warnings.push(...marker.warnings);
    lines.push({ series_node: row.series_node, marker, paths: visible ? [[]] : [] });
  }
  for (const [slot, row] of data.rows.entries()) {
    const fraction = (slot + 0.5) / data.rows.length,
      x = data.category_reversed ? 1 - fraction : fraction;
    const values = new Map(row.values.map((point) => [point.series_node, point]));
    const ordered = data.ordering.rows.map((series) => values.get(series.series_node));
    const project = (value) => {
      const projected = scale.project(value);
      return projected === null ? null : 1 - projected;
    };
    const points = ordered.map((point) =>
      point ? { ...point, x, y: project(point.value), index: row.index } : null,
    );
    if (points.some((point) => point && !Number.isFinite(point.y)))
      return unavailable("InvalidChartCoordinate");
    for (const [index, point] of points.entries()) {
      if (!point) {
        const paths = lines[index].paths;
        if (sourceLines.get(lines[index].series_node) && paths.at(-1).length) paths.push([]);
      } else if (sourceLines.get(point.series_node)) lines[index].paths.at(-1).push(point);
      else lines[index].paths.push([point]);
    }
    const present = ordered.filter(Boolean);
    if (settings.high_low_node !== null && present.length) {
      let minimum = Infinity,
        maximum = -Infinity;
      for (const point of present) {
        minimum = Math.min(minimum, point.value);
        maximum = Math.max(maximum, point.value);
      }
      if (minimum !== maximum && project(minimum) === project(maximum))
        return unavailable("UnrepresentableStockRange");
      highLow.push({
        index: row.index,
        x,
        y1: project(minimum),
        y2: project(maximum),
        minimum,
        maximum,
      });
    }
    if (gap !== null && points[0] && points.at(-1)) {
      const first = points[0],
        last = points.at(-1),
        width = 1 / data.rows.length / (1 + gap / 100);
      if (first.value !== last.value && first.y === last.y)
        return unavailable("UnrepresentableStockBody");
      bodies.push({
        index: row.index,
        first_ordinal: first.value_ordinal,
        last_ordinal: last.value_ordinal,
        first_y: first.y,
        last_y: last.y,
        direction: last.value > first.value ? "up" : last.value < first.value ? "down" : "equal",
        rectangle: {
          x: x - width / 2,
          y: Math.min(first.y, last.y),
          width,
          height: Math.abs(last.y - first.y),
        },
      });
    }
  }
  if (
    !highLow.length &&
    !bodies.length &&
    [...markers.values()].every((marker) => marker.symbol === "none") &&
    !lines.some((line) => line.paths.some((path) => path.length > 1))
  )
    return unavailable("EmptyStockGeometry");
  return {
    state: "ready",
    exact: false,
    direction: "col",
    minimum: scale.minimum,
    maximum: scale.maximum,
    value_reversed: scale.reversed,
    category_reversed: data.category_reversed,
    axes_hidden: data.axes_hidden,
    categories: data.categories,
    value_ticks: scale.ticks(),
    legend: data.ordering.rows.map((row) => ({
      series_node: row.series_node,
      text: data.series.find((series) => series.node === row.series_node).name,
    })),
    lines,
    stock: { high_low: highLow, bodies, gap_width: gap },
    warnings: [...new Set(warnings)],
  };
}
