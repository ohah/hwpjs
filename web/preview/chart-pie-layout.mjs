import { chartCircularData } from "./chart-circular-data.mjs";
import { chartCircularIntervals } from "./chart-circular-intervals.mjs";
import { chartFirstCircularSeries } from "./chart-circular-series.mjs";
const unavailable = reason => ({ state: "unavailable", reason });

/** Basic 2D pie preview. Source data is unchanged; fit/colors/labels are not source layout. */
export function chartPieLayout(display, plotNode) {
  const data = chartCircularData(display, plotNode);
  if (data.state !== "ready") return data;
  if (!["pieChart", "pie3DChart"].includes(data.kind)) return unavailable("UnsupportedPiePlotKind");
  const selection = chartFirstCircularSeries(data);
  if (selection.state !== "selected") return selection;
  if (data.first_slice_angle?.value === null) return unavailable("MissingPieAngleValue");
  const row = selection.row;
  if (row.explosion?.value === null) return unavailable("MissingPieExplosionValue");
  const angle = data.first_slice_angle?.value ?? 0, explosion = row.explosion?.value ?? 0;
  if (!Number.isInteger(angle) || angle < 0 || angle > 360 || !Number.isInteger(explosion) || explosion < 0 || explosion > 0xffffffff) return unavailable("InvalidPieSettings");
  const overrides = new Map(), indices = new Set(row.points.map(point => point.index));
  for (const setting of row.point_settings) {
    const index = setting.index?.value;
    if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) return unavailable("MissingPiePointIndex");
    if (overrides.has(index)) return unavailable("DuplicatePiePointIndex");
    if (!indices.has(index)) return unavailable("UnknownPiePointIndex");
    if (setting.explosion?.value === null) return unavailable("MissingPiePointExplosion");
    const value = setting.explosion?.value ?? explosion;
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) return unavailable("InvalidPieSettings");
    overrides.set(index, value);
  }
  for (const point of row.points) {
    if (!Number.isFinite(point.value)) return unavailable("MissingPieValue");
    if (point.value < 0) return unavailable("UnsupportedNegativePieValue");
  }
  const origin = angle * Math.PI / 180 - Math.PI / 2;
  const intervals = chartCircularIntervals(row.points.map(point => point.value), origin);
  if (intervals.state !== "ready") return unavailable("UnrepresentablePieShare");
  if (intervals.empty) return unavailable("EmptyPieMagnitude");
  let largestExplosion = 0;
  for (const point of row.points) if (point.value > 0) largestExplosion = Math.max(largestExplosion, overrides.get(point.index) ?? explosion);
  const radius = 0.42 / (1 + largestExplosion / 100);
  const slices = [];
  for (const [i, point] of row.points.entries()) {
    const interval = intervals.intervals[i], first = interval.start_angle, last = interval.end_angle;
    const middle = (first + last) / 2;
    const pointExplosion = overrides.get(point.index) ?? explosion, offset = point.value === 0 ? 0 : radius * (pointExplosion / 100);
    slices.push({ index: point.index, ordinal: point.value_ordinal, value: point.value, category: point.category,
      explosion: pointExplosion,
      color_index: i, ...interval,
      center_x: 0.5 + Math.cos(middle) * offset, center_y: 0.5 + Math.sin(middle) * offset, radius });
  }
  const warnings = [...selection.warnings, "PreviewPieFit", "SourceStylesNotApplied", "SourcePieDataLabelsNotApplied"];
  if (row.point_settings.some(setting => setting.unparsed_children)) warnings.push("SourcePointOverridesNotApplied");
  if (data.first_slice_angle === null) warnings.push("PreviewDefaultPieAngle");
  if (row.explosion === null) warnings.push("PreviewDefaultPieExplosion");
  return { state: "ready", exact: false, warnings, pie: { series_node: row.series_node, non_displayed_series_nodes: selection.non_displayed_series_nodes, first_slice_angle: angle, explosion, slices } };
}
