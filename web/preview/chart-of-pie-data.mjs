import { chartCircularData } from "./chart-circular-data.mjs";
import { chartFirstCircularSeries } from "./chart-circular-series.mjs";
import { createChartAbsoluteTotal } from "./chart-absolute-total.mjs";
const unavailable = (reason) => ({ state: "unavailable", reason });

/** Membership only. Automatic tail selection is an explicit preview policy. */
export function chartOfPieData(display, plotNode) {
  const data = chartCircularData(display, plotNode);
  if (data.state !== "ready") return data;
  if (data.kind !== "ofPieChart") return unavailable("UnsupportedOfPiePlotKind");
  const selection = chartFirstCircularSeries(data);
  if (selection.state !== "selected") return selection;
  const row = selection.row,
    settings = display.plot_settings[display.plots.findIndex((plot) => plot.node === plotNode)];
  for (const key of [
    "of_pie_type",
    "second_pie_size",
    "split_type",
    "split_position",
    "custom_split_node",
  ])
    if (settings[key] === undefined) return unavailable("MissingOfPieSettings");
  if (
    settings.of_pie_type?.value === null ||
    settings.second_pie_size?.value === null ||
    settings.split_type?.value === null
  )
    return unavailable("MissingOfPieSettingValue");
  const kind = settings.of_pie_type?.value ?? "pie",
    size = settings.second_pie_size?.value ?? 75;
  if (!["pie", "bar"].includes(kind) || !Number.isInteger(size) || size < 5 || size > 200)
    return unavailable("InvalidOfPieSettings");
  if (row.points.length < 2) return unavailable("InsufficientOfPiePoints");
  if (row.points.some((point) => !Number.isFinite(point.value)))
    return unavailable("MissingOfPieValue");
  if (row.points.some((point) => point.value < 0))
    return unavailable("UnsupportedNegativeOfPieValue");
  const total = createChartAbsoluteTotal(row.points.map((point) => point.value));
  if (total.isZero) return unavailable("EmptyOfPieMagnitude");
  if (row.points.some((point) => point.value > 0 && total.share(point.value) === 0))
    return unavailable("UnrepresentableOfPieShare");
  const mode = settings.split_type?.value ?? "auto",
    sourcePosition = settings.split_position;
  if (mode === "cust" || settings.custom_split_node !== null)
    return unavailable("UnsupportedCustomOfPieSplit");
  const warnings = [...selection.warnings];
  let selected;
  if (mode === "auto") {
    if (sourcePosition !== null) return unavailable("UnsupportedAutoSplitPosition");
    const count = Math.min(2, row.points.length - 1);
    selected = (_, i) => i >= row.points.length - count;
    warnings.push("PreviewAutoSplitLastTwo");
  } else {
    if (sourcePosition?.value?.kind !== "finite" || !Number.isFinite(sourcePosition.value.value))
      return unavailable("MissingOfPieSplitPosition");
    const position = sourcePosition.value.value;
    if (mode === "pos") {
      if (!Number.isInteger(position) || position < 0) return unavailable("InvalidOfPieSplitCount");
      selected = (_, i) => i >= row.points.length - position;
      warnings.push("PreviewPositionTailSplit");
    } else if (mode === "val") selected = (point) => point.value < position;
    else if (mode === "percent") {
      if (position < 0 || position > 100) return unavailable("InvalidOfPieSplitPercent");
      selected = (point) => total.share(point.value) * 100 < position;
    } else return unavailable("UnsupportedOfPieSplitType");
  }
  if (settings.of_pie_type === null) warnings.push("PreviewDefaultOfPieType");
  if (settings.second_pie_size === null) warnings.push("PreviewDefaultSecondPieSize");
  const primary = [],
    secondary = [],
    combined = total.accumulator();
  let combinedFraction = 0;
  for (const [i, point] of row.points.entries()) {
    const target = selected(point, i) ? secondary : primary;
    target.push({ ...point, color_index: i, global_fraction: total.share(point.value) });
    if (target === secondary) combinedFraction = combined(point.value);
  }
  const secondaryTotal = createChartAbsoluteTotal(secondary.map((point) => point.value));
  for (const point of secondary) point.secondary_fraction = secondaryTotal.share(point.value);
  if (secondaryTotal.isZero) warnings.push("PreviewEmptyOfPieSecondary");
  return {
    state: "ready",
    exact: false,
    mode: "membership-preview",
    series_node: row.series_node,
    plot_type: kind,
    second_pie_size: size,
    non_displayed_series_nodes: selection.non_displayed_series_nodes,
    series_explosion: row.explosion,
    point_settings: row.point_settings,
    source_split_type: settings.split_type?.value ?? null,
    split_mode: mode,
    warnings,
    primary,
    secondary,
    combined: {
      kind: "combined",
      ordinal: null,
      global_fraction: combinedFraction,
      member_indices: secondary.map((point) => point.index),
    },
  };
}
