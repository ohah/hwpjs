import { chartSeriesInput } from "./chart-plot-input.mjs";
const kinds = new Set(["pieChart", "pie3DChart", "ofPieChart", "doughnutChart"]);
const unavailable = reason => ({ state: "unavailable", reason });

/** Axis-free source data only; no inferred angles, explosion, rings or split policy. */
export function chartCircularData(display, plotNode) {
  const plot = display.plots.find(plot => plot.node === plotNode);
  if (!plot) return unavailable("MissingChartPlot");
  if (!kinds.has(plot.kind)) return unavailable("UnsupportedCircularPlotKind");
  if (display.axis_links.some(link => link.plot_node === plotNode)) return unavailable("UnexpectedCircularAxes");
  const input = chartSeriesInput(display, plotNode);
  if (input.state !== "ready") return input;
  const plotSettings = display.plot_settings?.[input.index];
  const settings = new Map((display.series_settings ?? []).map(row => [row.series_node, row]));
  if (!plotSettings || plotSettings.first_slice_angle === undefined || !Array.isArray(display.point_settings)) return unavailable("MissingCircularSettings");
  const copyField = value => value === null ? null : { ...value };
  const rows = [];
  for (const series of input.series) {
    const setting = settings.get(series.node);
    if (!setting || setting.explosion === undefined) return unavailable("MissingCircularSettings");
    if (["x", "y", "bubble_size"].some(role => series.roles[role].length)) return unavailable("UnsupportedCircularRoles");
    if (!series.points.length) return unavailable("EmptyCircularData");
    const points = [];
    for (const point of series.points) {
      if (point.value && point.value.number?.kind !== "finite") return unavailable("NonNumericChartValue");
      points.push({ index: point.index, category: point.category?.value ?? null, category_ordinal: point.category?.ordinal ?? null,
        value: point.value?.number.value ?? null, value_ordinal: point.value?.ordinal ?? null });
    }
    const pointSettings = display.point_settings.filter(row => row.series_node === series.node).map(row => ({ ...row, index: copyField(row.index), explosion: copyField(row.explosion) }));
    rows.push({ series_node: series.node, name: series.name?.text ?? null, explosion: copyField(setting.explosion), point_settings: pointSettings, points });
  }
  return { state: "ready", kind: plot.kind, first_slice_angle: copyField(plotSettings.first_slice_angle), rows, exact: false, mode: "source-data-only" };
}
