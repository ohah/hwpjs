import { chartScatterData } from "./chart-scatter-data.mjs";
import { chartMarkerPolicy, chartMarkerSettings } from "./chart-marker-policy.mjs";
import { chartCurvePaths } from "./chart-curve-paths.mjs";
export function chartScatterPrimitives(display, plotNode) {
  const data = chartScatterData(display, plotNode);
  if (data.state !== "ready") return data;
  const warnings = [];
  const settingsBySeries = chartMarkerSettings(display);
  for (const row of data.rows) {
    const setting = settingsBySeries.get(row.series_node), smooth = setting?.smooth;
    if (smooth && smooth.value !== null && typeof smooth.value !== "boolean") return { state: "unavailable", reason: "InvalidChartSeriesCurve" };
    row.smooth = smooth ? smooth.value !== false : ["smooth", "smoothMarker"].includes(data.style);
    row.curves = null;
    if (row.smooth && data.style !== "marker") {
      const curves = chartCurvePaths(row.points); if (curves.state !== "ready") return curves;
      row.curves = curves.paths; warnings.push("PreviewUniformCatmullRom", "PreviewClampedCurveEndpoints");
    }
    const marker = chartMarkerPolicy(setting, ["lineMarker", "marker", "smoothMarker"].includes(data.style), { allowSmooth: true });
    if (marker.state !== "ready") return marker;
    row.marker = marker; warnings.push(...marker.warnings);
  }
  return { state: "ready", exact: false, direction: "col", grouping: "standard", minimum: data.y_axis.minimum, maximum: data.y_axis.maximum,
    categories: [], category_ticks: data.x_axis.ticks, value_ticks: data.y_axis.ticks, legend: data.legend,
    axes_hidden: { value: data.y_axis.hidden, category: data.x_axis.hidden }, scatter: { style: data.style, rows: data.rows },
    blank_policy: data.blank_policy,
    warnings: ["SourceStylesNotApplied", ...data.blank_policy_warnings, ...new Set(warnings), ...(data.rows.some(row => row.marker.automatic) ? ["PreviewScatterMarkerDots"] : [])] };
}
