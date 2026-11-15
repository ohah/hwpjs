import { chartPlotInput } from './chart-plot-input.mjs';
import { createChartValueScale } from './chart-value-scale.mjs';
import { chartFamilySettings } from './chart-family-settings.mjs';
import { unavailable, familyWarnings, familyGeometry } from './chart-family-geometry.mjs';
export function chartBubblePrimitives(display, node) {
  if (display.plots.find((p) => p.node === node)?.kind !== 'bubbleChart')
    return unavailable('UnsupportedBubblePlotKind');
  const settings = chartFamilySettings(display, node, {
    bubble_scale: (v) => Number.isInteger(v) && v >= 0 && v <= 300,
    size_represents: (v) => ['area', 'w'].includes(v),
    show_negative_bubbles: (v) => typeof v === 'boolean',
    bubble_3d: (v) => typeof v === 'boolean',
  });
  if (settings.state !== 'ready') return settings;
  const input = chartPlotInput(display, node);
  if (input.state !== 'ready') return input;
  if (input.axes.length !== 2 || input.axes.some((a) => a.kind !== 'valAx'))
    return unavailable('AmbiguousBubbleAxes');
  const xs = input.axes.filter((a) => ['b', 't'].includes(a.position?.value)),
    ys = input.axes.filter((a) => ['l', 'r'].includes(a.position?.value));
  if (xs.length !== 1 || ys.length !== 1) return unavailable('AmbiguousBubbleAxisPosition');
  const triples = [];
  let missing = 0;
  for (const series of input.series) {
    if (['category', 'value'].some((r) => series.roles[r].length))
      return unavailable('UnsupportedBubbleRoles');
    for (const p of series.points) {
      if ([p.x, p.y, p.bubble_size].some((v) => v && v.number?.kind !== 'finite'))
        return unavailable('NonNumericBubbleValue');
      if (!p.x || !p.y || !p.bubble_size) {
        missing++;
        continue;
      }
      triples.push({
        series_node: series.node,
        index: p.index,
        x_ordinal: p.x.ordinal,
        y_ordinal: p.y.ordinal,
        size_ordinal: p.bubble_size.ordinal,
        x_value: p.x.number.value,
        y_value: p.y.number.value,
        size: p.bubble_size.number.value,
      });
    }
  }
  if (triples.length > 16384) return unavailable('ChartFamilyCellBudgetExceeded');
  if (!triples.length) return unavailable('EmptyBubbleTriples');
  const sx = createChartValueScale(
      triples.map((p) => p.x_value),
      xs[0].scaling,
    ),
    sy = createChartValueScale(
      triples.map((p) => p.y_value),
      ys[0].scaling,
    );
  if (sx.state !== 'ready') return sx;
  if (sy.state !== 'ready') return sy;
  let maximum = 0;
  for (const p of triples)
    if (p.size >= 0 || settings.show_negative_bubbles)
      maximum = Math.max(maximum, Math.abs(p.size));
  const g = familyGeometry('bubbleChart'),
    points = [];
  if (settings.bubble_3d) g.disclosure = '버블 구형 하이라이트 근사';
  for (const p of triples) {
    const x = sx.project(p.x_value),
      projectedY = sy.project(p.y_value),
      y = Number.isFinite(projectedY) ? 1 - projectedY : NaN;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return unavailable('InvalidChartCoordinate');
    const share = maximum === 0 ? 0 : Math.abs(p.size) / maximum;
    const radius =
      0.09 *
      (settings.bubble_scale / 100) *
      (settings.size_represents === 'area' ? Math.sqrt(share) : share);
    const point = { ...p, x, y, radius, sphere: settings.bubble_3d };
    points.push(point);
    if (p.size < 0 && !settings.show_negative_bubbles) continue;
    if (radius > 0) g.circles.push(point);
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
    legend: input.legend,
    family_geometry: g,
    bubble_points: points,
    missing_triples: missing,
    warnings: [
      ...familyWarnings,
      'PreviewBubbleRelativeSize',
      'PreviewBubbleMissingTriplesOmitted',
      ...(settings.bubble_3d ? ['PreviewBubbleSphereApproximation'] : []),
      'SourceBubbleAxesAndLabelsNotApplied',
    ],
  };
}
