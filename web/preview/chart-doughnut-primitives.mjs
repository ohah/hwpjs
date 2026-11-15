import { chartCircularData } from './chart-circular-data.mjs';
import { chartCircularIntervals } from './chart-circular-intervals.mjs';
import { chartFamilySettings } from './chart-family-settings.mjs';
import { unavailable, familyWarnings, familyGeometry } from './chart-family-geometry.mjs';
export function chartDoughnutPrimitives(display, node) {
  if (display.plots.find((p) => p.node === node)?.kind !== 'doughnutChart')
    return unavailable('UnsupportedDoughnutPlotKind');
  const settings = chartFamilySettings(display, node, {
    hole_size: (v) => Number.isInteger(v) && v >= 10 && v <= 90,
  });
  if (settings.state !== 'ready') return settings;
  const data = chartCircularData(display, node);
  if (data.state !== 'ready') return data;
  if (data.rows.reduce((n, r) => n + r.points.length, 0) > 16384)
    return unavailable('ChartFamilyCellBudgetExceeded');
  if (data.first_slice_angle?.value === null) return unavailable('MissingPieAngleValue');
  const angle = data.first_slice_angle?.value ?? 0,
    g = familyGeometry('doughnutChart');
  if (!Number.isInteger(angle) || angle < 0 || angle > 360)
    return unavailable('InvalidPieSettings');
  const rings = [];
  for (const [i, row] of data.rows.entries()) {
    if (row.explosion?.value === null) return unavailable('MissingPieExplosionValue');
    // Explosion geometry across concentric rings is not yet established.
    if (
      (row.explosion?.value ?? 0) !== 0 ||
      row.point_settings.some(
        (p) =>
          (p.explosion?.value ?? 0) !== 0 || p.explosion?.value === null || p.unparsed_children,
      )
    )
      return unavailable('UnsupportedDoughnutExplosionOrOverrides');
    if (row.points.some((p) => p.value === null || !Number.isFinite(p.value)))
      return unavailable('MissingDoughnutValue');
    if (row.points.some((p) => p.value < 0)) return unavailable('UnsupportedNegativeDoughnutValue');
    const intervals = chartCircularIntervals(
      row.points.map((p) => p.value),
      (angle * Math.PI) / 180 - Math.PI / 2,
    );
    if (intervals.state !== 'ready') return intervals;
    const hole = (0.42 * settings.hole_size) / 100,
      width = (0.42 - hole) / data.rows.length;
    const inner = hole + i * width,
      outer = inner + width;
    rings.push({
      series_node: row.series_node,
      inner_radius: inner,
      outer_radius: outer,
      empty: intervals.empty,
    });
    for (const [j, point] of row.points.entries()) {
      if (point.value === 0) continue;
      g.sectors.push({
        series_node: row.series_node,
        index: point.index,
        ordinal: point.value_ordinal,
        value: point.value,
        color_index: j,
        x: 0.5,
        y: 0.5,
        inner_radius: inner,
        outer_radius: outer,
        ...intervals.intervals[j],
      });
    }
  }
  return {
    state: 'ready',
    exact: false,
    family_geometry: g,
    rings,
    warnings: [
      ...familyWarnings,
      'PreviewConcentricRings',
      'SourcePieDataLabelsNotApplied',
      ...(data.first_slice_angle === null ? ['PreviewDefaultPieAngle'] : []),
    ],
  };
}
