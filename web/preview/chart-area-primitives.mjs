import { chartCartesianData } from './chart-cartesian-data.mjs';
import { chartLineValues } from './chart-line-values.mjs';
import { chartBlankPolicy, chartLineBlankSeries } from './chart-blank-policy.mjs';
import { createChartValueScale } from './chart-value-scale.mjs';
import {
  unavailable,
  familyWarnings,
  familyGeometry,
  addFamilyPolygon,
  familyBudget,
} from './chart-family-geometry.mjs';

export function chartAreaPrimitives(display, plotNode) {
  const index = display.plots.findIndex((p) => p.node === plotNode);
  if (index < 0) return unavailable('MissingChartPlot');
  const kind = display.plots[index].kind;
  if (!['areaChart', 'area3DChart'].includes(kind)) return unavailable('UnsupportedAreaPlotKind');
  const grouping = display.plot_settings[index].grouping?.value;
  if (!['standard', 'stacked', 'percentStacked'].includes(grouping))
    return unavailable('UnsupportedAreaGrouping');
  const data = chartCartesianData(display, plotNode);
  if (data.state !== 'ready') return data;
  if (!familyBudget(data)) return unavailable('ChartFamilyCellBudgetExceeded');
  if (data.series.some((s) => ['x', 'y', 'bubble_size'].some((r) => s.roles[r].length)))
    return unavailable('UnsupportedAreaRoles');
  const blanks = chartBlankPolicy(display);
  if (blanks.state !== 'selected') return blanks;
  if (grouping !== 'standard' && blanks.value !== 'gap')
    return unavailable('UnsupportedGroupedAreaBlankPolicy');
  const filled = chartLineBlankSeries(data.series, data.indices, blanks.value);
  if (filled.state !== 'ready') return filled;
  const values = chartLineValues(filled.series, grouping);
  if (values.state !== 'ready') return values;
  const scale = createChartValueScale(
    [...values.domain, ...values.rows.flatMap((r) => r.points.map((p) => p.start_value))],
    data.valueAxis.scaling,
  );
  if (scale.state !== 'ready') return scale;
  if (scale.logarithm !== null) return unavailable('UnsupportedLogAreaBaseline');
  const slots = new Map(data.indices.map((v, i) => [v, i]));
  const g = familyGeometry(kind),
    rows = [];
  for (const row of values.rows) {
    const points = row.points.map((p) => {
      const x = (slots.get(p.index) + 0.5) / data.indices.length;
      const end = scale.project(p.end_value),
        start = scale.project(p.start_value);
      return {
        ...p,
        x: data.categoryReversed ? 1 - x : x,
        y: Number.isFinite(end) ? 1 - end : NaN,
        base_y: Number.isFinite(start) ? 1 - start : NaN,
      };
    });
    if (points.some((p) => ![p.x, p.y, p.base_y].every(Number.isFinite)))
      return unavailable('InvalidChartCoordinate');
    rows.push({ series_node: row.series_node, points });
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      if (blanks.value !== 'span' && slots.get(b.index) !== slots.get(a.index) + 1) continue;
      const vertex = (p) => ({ x: p.x, y: p.y }),
        base = (p) => ({ x: p.x, y: p.base_y });
      const da = a.y - a.base_y,
        db = b.y - b.base_y;
      const pieces = [];
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const magnitude = Math.max(Math.abs(da), Math.abs(db));
        const t = Math.abs(da) / magnitude / (Math.abs(da) / magnitude + Math.abs(db) / magnitude);
        const cross = { x: a.x * (1 - t) + b.x * t, y: a.base_y * (1 - t) + b.base_y * t };
        pieces.push([vertex(a), cross, base(a)], [cross, vertex(b), base(b)]);
      } else pieces.push([vertex(a), vertex(b), base(b), base(a)]);
      for (const piece of pieces)
        if (!addFamilyPolygon(g, piece, row.series_node, { indices: [a.index, b.index] }))
          return unavailable('InvalidChartCoordinate');
    }
  }
  return {
    state: 'ready',
    exact: false,
    direction: 'col',
    grouping,
    minimum: scale.minimum,
    maximum: scale.maximum,
    value_reversed: scale.reversed,
    category_reversed: data.categoryReversed,
    axes_hidden: data.axesHidden,
    categories: data.categories,
    legend: data.legend,
    value_ticks: scale.ticks(),
    area_rows: rows,
    family_geometry: g,
    blank_policy: blanks.value,
    warnings: [
      ...familyWarnings,
      ...blanks.warnings,
      'PreviewAreaLinearBands',
      ...(grouping !== 'standard' ? ['PreviewAlgebraicStacks'] : []),
      ...(grouping === 'percentStacked' ? ['PreviewAbsolutePercentTotal'] : []),
    ],
  };
}
