import { chartCartesianData } from './chart-cartesian-data.mjs';
import { chartBlankPolicy, chartLineBlankSeries } from './chart-blank-policy.mjs';
import { createChartValueScale } from './chart-value-scale.mjs';
import { chartFamilySettings } from './chart-family-settings.mjs';
import {
  unavailable,
  familyWarnings,
  familyGeometry,
  familyBudget,
  addFamilyStroke,
  addFamilyPolygon,
} from './chart-family-geometry.mjs';
export function chartRadarPrimitives(display, node) {
  if (display.plots.find((p) => p.node === node)?.kind !== 'radarChart')
    return unavailable('UnsupportedRadarPlotKind');
  const style = chartFamilySettings(display, node, {
    radar_style: (v) => ['standard', 'marker', 'filled'].includes(v),
  });
  if (style.state !== 'ready') return style;
  const data = chartCartesianData(display, node);
  if (data.state !== 'ready') return data;
  if (!familyBudget(data)) return unavailable('ChartFamilyCellBudgetExceeded');
  if (data.series.some((s) => ['x', 'y', 'bubble_size'].some((r) => s.roles[r].length)))
    return unavailable('UnsupportedRadarRoles');
  const blanks = chartBlankPolicy(display);
  if (blanks.state !== 'selected') return blanks;
  if (blanks.value === 'span') return unavailable('UnsupportedRadarSpanBlanks');
  const fill = chartLineBlankSeries(data.series, data.indices, blanks.value);
  if (fill.state !== 'ready') return fill;
  const values = fill.series.flatMap((s) =>
    s.points
      .filter((p) => p.value)
      .map((p) => (p.value.number?.kind === 'finite' ? p.value.number.value : NaN)),
  );
  const scale = createChartValueScale(values, data.valueAxis.scaling);
  if (scale.state !== 'ready') return scale;
  const g = familyGeometry('radarChart'),
    rows = [];
  for (const series of fill.series) {
    const byIndex = new Map(series.points.map((p) => [p.index, p]));
    const points = data.indices.map((index, i) => {
      const p = byIndex.get(index);
      if (!p?.value) return null;
      const r = scale.project(p.value.number?.value);
      if (!Number.isFinite(r)) return { x: NaN, y: NaN };
      const angle =
        ((data.categoryReversed ? -1 : 1) * i * 2 * Math.PI) / data.indices.length - Math.PI / 2;
      const radius = 0.42 * Math.max(0, Math.min(1, r));
      return {
        index,
        ordinal: p.value.ordinal,
        value: p.value.number.value,
        x: 0.5 + radius * Math.cos(angle),
        y: 0.5 + radius * Math.sin(angle),
      };
    });
    if (points.some((p) => p && ![p.x, p.y].every(Number.isFinite)))
      return unavailable('InvalidChartCoordinate');
    rows.push({ series_node: series.node, points });
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      const hasDistinctEdge = points.length > 2 || (points.length === 2 && i === 0);
      if (hasDistinctEdge && a && b && !addFamilyStroke(g, a, b, series.node))
        return unavailable('InvalidChartCoordinate');
      if (a && (style.radar_style === 'marker' || points.length === 1))
        g.circles.push({ ...a, series_node: series.node, radius: 0.006, sphere: false });
    }
    if (style.radar_style === 'filled' && points.length >= 3 && points.every(Boolean))
      addFamilyPolygon(g, points, series.node);
  }
  return {
    state: 'ready',
    exact: false,
    direction: 'col',
    minimum: 0,
    maximum: 1,
    value_ticks: [
      { value: 0, fraction: 0 },
      { value: 1, fraction: 1 },
    ],
    categories: [],
    axes_hidden: { value: true, category: true },
    legend: data.legend,
    family_geometry: g,
    radar_rows: rows,
    radar_style: style.radar_style,
    warnings: [
      ...familyWarnings,
      ...blanks.warnings,
      'PreviewRadarRadialScale',
      'PreviewRadarRadialClipping',
      'SourceRadarAxesAndLabelsNotApplied',
      ...(style.radar_style === 'marker' || data.indices.length === 1
        ? ['PreviewRadarMarkerDots']
        : []),
    ],
  };
}
