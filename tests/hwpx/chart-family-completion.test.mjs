import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeBaselineGolden } from './chart-baseline-golden-codec.mjs';
const baselineGoldens = decodeBaselineGolden(
  JSON.parse(
    readFileSync(new URL('./fixtures/chart-family-baseline-4e99.json', import.meta.url), 'utf8'),
  ),
).cases;
import { model, camera, proposed, context } from './chart-family-model.mjs';
import { decodeChartDisplay } from '../../js/hwpx-chart-display.mjs';
import {
  chartPreviewPrimitives,
  chartPreviewKinds,
} from '../../web/preview/chart-preview-primitives.mjs';
import { paintChartPreview } from '../../web/preview/chart-preview-paint.mjs';
import { validChartFamily, paintChartFamily } from '../../web/preview/chart-family-paint.mjs';
import { clipFamilyPolygon, familyGeometry } from '../../web/preview/chart-family-geometry.mjs';
const ready = (d) => {
  const before = structuredClone(d),
    p = chartPreviewPrimitives(d);
  assert.equal(p.state, 'ready', JSON.stringify(p));
  assert.deepEqual(d, before);
  return p;
};
const paint = (p) => {
  const c = context();
  assert.equal(
    paintChartPreview(c.ctx, { x: 20, y: 50, width: 600, height: 400, primitives: p }, 30),
    true,
  );
  assert.equal(c.depth(), 0);
  return c.calls;
};
const wire = (d) => decodeChartDisplay(new TextEncoder().encode(JSON.stringify(d)));

test('dispatch enumerates exactly 16 distinct OOXML kinds, malformed/combo fail closed', () => {
  assert.equal(chartPreviewKinds.length, 16);
  assert.equal(new Set(chartPreviewKinds).size, 16);
  assert(Object.isFrozen(chartPreviewKinds));
  assert.equal(chartPreviewPrimitives(null).reason, 'MissingChartPlots');
  const d = model();
  d.plots.push({ ...d.plots[0], node: 999 });
  assert.equal(chartPreviewPrimitives(d).reason, 'UnsupportedComboChartPaint');
});
for (const kind of ['areaChart', 'area3DChart', 'line3DChart'])
  test(`current decoded DTO: ${kind} projects without extra Native fields`, () => {
    const d = kind === 'areaChart' ? model(kind) : camera(model(kind));
    assert.deepEqual(wire(d), d);
    const p = ready(d);
    assert(validChartFamily(p.family_geometry));
    assert(p.family_geometry.polygons.length + p.family_geometry.strokes.length > 0);
    paint(p);
  });
for (const kind of ['doughnutChart', 'radarChart', 'bubbleChart', 'surfaceChart', 'surface3DChart'])
  test(`current decoded DTO: ${kind} publicly reports missing Native settings`, () => {
    const d = model(kind),
      p = chartPreviewPrimitives(wire(d));
    assert.equal(p.state, 'unavailable');
    assert.equal(p.reason, 'MissingNativeChartFamilySettings');
    assert(p.required_fields.length);
    assert(p.message.includes(kind));
    assert.equal(p.diagnostics[0].kind, kind);
  });
test('area signed crossing splits bands, preserves zero, ordinals and source', () => {
  const p = ready(model('areaChart', [[2, -2, 0]]));
  assert.equal(p.family_geometry.polygons.length, 3);
  assert.deepEqual(
    p.area_rows[0].points.map((p) => p.value),
    [2, -2, 0],
  );
  for (const poly of p.family_geometry.polygons)
    assert(poly.points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
  paint(p);
});
test('area gap/zero/span policies preserve holes and generated-zero provenance', () => {
  const d = model('areaChart', [
    [1, null, 3],
    [1, 2, 3],
  ]);
  assert.equal(ready(d).family_geometry.polygons.length, 2);
  d.blank_policy = { node: 980, value: 'zero' };
  let p = ready(d);
  assert.equal(p.family_geometry.polygons.length, 4);
  assert.equal(p.area_rows[0].points[1].generated, true);
  assert.equal(p.area_rows[0].points[1].ordinal, null);
  d.blank_policy.value = 'span';
  assert.equal(ready(d).family_geometry.polygons.length, 3);
  d.plot_settings[0].grouping.value = 'stacked';
  assert.equal(chartPreviewPrimitives(d).reason, 'UnsupportedGroupedAreaBlankPolicy');
});
test('area stack and percent use shared signed algebraic values and stable extremes', () => {
  const d = model('areaChart', [
    [4, -4, 0],
    [2, -2, 0],
  ]);
  d.plot_settings[0].grouping.value = 'stacked';
  let p = ready(d);
  assert.deepEqual(
    p.area_rows[1].points.map((p) => [p.start_value, p.end_value]),
    [
      [4, 6],
      [-4, -6],
      [0, 0],
    ],
  );
  d.plot_settings[0].grouping.value = 'percentStacked';
  p = ready(d);
  assert.equal(p.area_rows[1].points[0].end_value, 1);
  assert.equal(p.area_rows[1].points[1].end_value, -1);
  ready(model('areaChart', [[Number.MAX_VALUE, -Number.MAX_VALUE, 0]]));
});
test('area rejects invalid roles, nonnumeric values, logarithmic baseline and grid explosion', () => {
  let d = model();
  d.bindings[0].role = 'x';
  assert.equal(chartPreviewPrimitives(d).reason, 'UnsupportedAreaRoles');
  d = model();
  d.points[0].value = 'NaN';
  assert.equal(chartPreviewPrimitives(d).state, 'unavailable');
  d = model('areaChart', [[1, 2, 3]]);
  d.axes[0].scaling = { log_base: { value: { kind: 'finite', value: 10 } } };
  assert.equal(chartPreviewPrimitives(d).reason, 'NonPositiveLogScale');
  d = model();
  for (let i = 0; i < 9000; i++) {
    d.points.push({ ...d.points[0], index: i + 100 });
    d.bindings.push({ ...d.bindings[0] });
  }
  assert.equal(chartPreviewPrimitives(d).reason, 'ChartFamilyCellBudgetExceeded');
});
test('area explicit bounds and reversed category/value orientation remain clipped', () => {
  const d = model();
  d.axes[0].scaling = {
    minimum: { value: { kind: 'finite', value: -1 } },
    maximum: { value: { kind: 'finite', value: 1 } },
    orientation: { value: 'maxMin' },
  };
  d.axes[1].scaling = { orientation: { value: 'maxMin' } };
  const p = ready(d);
  assert(p.area_rows[0].points[0].x > p.area_rows[0].points[1].x);
  assert(validChartFamily(p.family_geometry));
  paint(p);
});
test('3D refuses missing, perspective, unparsed and empty view fields', () => {
  for (const kind of ['area3DChart', 'line3DChart']) {
    let d = model(kind);
    assert.equal(chartPreviewPrimitives(d).reason, 'MissingChart3DView');
    camera(d);
    d.view_3d.right_angle_axes.value = false;
    assert.equal(chartPreviewPrimitives(d).reason, 'UnsupportedPerspectiveChartFamily');
    d = camera(model(kind));
    d.view_3d.rotation_y.value = null;
    assert.equal(chartPreviewPrimitives(d).reason, 'MissingChart3DViewValue');
    d = camera(model(kind));
    d.view_3d.unparsed_children = true;
    assert.equal(chartPreviewPrimitives(d).reason, 'UnsupportedChart3DViewChildren');
  }
});
for (const kind of ['doughnutChart', 'radarChart', 'bubbleChart', 'surfaceChart', 'surface3DChart'])
  test(`proposed contract only: ${kind} geometry and painter`, () => {
    const d = proposed(model(kind));
    if (kind === 'surface3DChart') camera(d);
    if (kind === 'doughnutChart')
      d.points.forEach((p) => (p.value = String(Math.abs(Number(p.value)))));
    const p = ready(d);
    assert(validChartFamily(p.family_geometry));
    paint(p);
    delete d.plot_settings[0].family_unparsed_children;
    assert.equal(chartPreviewPrimitives(d).reason, 'MissingNativeChartFamilySettings');
  });
test('proposed doughnut: multiple rings, holes, all zero and negative refusal', () => {
  const d = proposed(
      model('doughnutChart', [
        [2, 0, 2],
        [0, 0, 0],
      ]),
    ),
    p = ready(d);
  assert.equal(p.rings.length, 2);
  assert.equal(p.rings[1].empty, true);
  assert.equal(p.family_geometry.sectors.length, 2);
  assert.equal(p.rings[0].inner_radius, 0.21);
  assert.equal(p.rings[0].outer_radius, p.rings[1].inner_radius);
  assert(
    paint(p)
      .filter((c) => c[0] === 'arc')
      .some((c) => c[6] === true),
  );
  d.points[0].value = '-1';
  assert.equal(chartPreviewPrimitives(d).reason, 'UnsupportedNegativeDoughnutValue');
});
test('proposed settings never replace null, invalid enum, aliases or unparsed content', () => {
  for (const value of [
    null,
    { node: 820, value: null },
    { node: 820, value: 9 },
    { node: 820, value: 91 },
    { node: 3, value: 50 },
  ]) {
    const d = proposed(model('doughnutChart'));
    d.plot_settings[0].hole_size = value;
    assert.equal(chartPreviewPrimitives(d).state, 'unavailable');
  }
  const d = proposed(model('radarChart'));
  d.plot_settings[0].radar_style.value = 'unknown';
  assert.equal(chartPreviewPrimitives(d).reason, 'InvalidNativeChartFamilySetting');
  d.plot_settings[0].radar_style.value = 'standard';
  d.plot_settings[0].family_unparsed_children = true;
  assert.equal(chartPreviewPrimitives(d).reason, 'UnsupportedChartFamilyChildren');
});
test('proposed radar: gaps never close filled polygons; zero fills only derived values', () => {
  const d = proposed(
    model('radarChart', [
      [1, null, -1],
      [1, 2, 3],
    ]),
  );
  let p = ready(d);
  assert.equal(p.family_geometry.polygons.length, 1);
  assert.equal(p.radar_rows[0].points[1], null);
  d.blank_policy = { node: 980, value: 'zero' };
  p = ready(d);
  assert.equal(p.family_geometry.polygons.length, 2);
  assert.equal(p.radar_rows[0].points[1].ordinal, null);
  d.plot_settings[0].radar_style.value = 'marker';
  p = ready(d);
  assert.equal(p.family_geometry.circles.length, 6);
  paint(p);
});
test('proposed bubble: explicit X/size join, area/width scale, zero and negative size', () => {
  const d = proposed(model('bubbleChart', [[1, 2, 3]]));
  let p = ready(d);
  assert.deepEqual(
    p.bubble_points.map((p) => p.x_value),
    [10, 20, 30],
  );
  assert.deepEqual(
    p.bubble_points.map((p) => p.size),
    [0, 4, 8],
  );
  assert.equal(p.family_geometry.circles.length, 2);
  assert(Math.abs(p.bubble_points[1].radius / p.bubble_points[2].radius - Math.sqrt(0.5)) < 1e-12);
  d.plot_settings[0].size_represents.value = 'w';
  p = ready(d);
  assert.equal(p.bubble_points[1].radius / p.bubble_points[2].radius, 0.5);
  const sizeIndex = d.bindings.findIndex((b) => b.role === 'bubble_size');
  d.points[sizeIndex].value = '-9';
  p = ready(d);
  assert.equal(p.family_geometry.circles.length, 2);
  d.plot_settings[0].show_negative_bubbles.value = true;
  d.plot_settings[0].bubble_3d.value = true;
  p = ready(d);
  assert.equal(p.family_geometry.circles.length, 3);
  assert(p.warnings.includes('PreviewBubbleSphereApproximation'));
  paint(p);
});
test('proposed bubble: missing triples omit points without invented category X or size', () => {
  const d = proposed(model('bubbleChart', [[1, 2, 3]]));
  let i = d.bindings.findIndex((b) => b.role === 'x');
  d.points.splice(i, 1);
  d.bindings.splice(i, 1);
  let p = ready(d);
  assert.equal(p.missing_triples, 1);
  assert.deepEqual(
    p.bubble_points.map((p) => p.index),
    [1, 2],
  );
  i = d.bindings.findIndex((b) => b.role === 'bubble_size');
  d.points[i].value = 'NaN';
  assert.equal(chartPreviewPrimitives(d).state, 'unavailable');
});
test('proposed surface: explicit matrix holes, signed cells and wireframe option', () => {
  const d = proposed(
    model('surfaceChart', [
      [1, 0, -1],
      [2, 0, -2],
    ]),
  );
  let p = ready(d);
  assert.equal(p.surface_cells.length, 2);
  assert.equal(p.family_geometry.polygons.length, 2);
  assert.deepEqual(
    p.surface_cells[0].samples.map((s) => s.value),
    [1, 0, 0, 2],
  );
  d.plot_settings[0].wireframe.value = true;
  p = ready(d);
  assert.equal(p.family_geometry.polygons.length, 0);
  assert.equal(p.family_geometry.strokes.length, 8);
  paint(p);
  const i = d.points.findIndex((p, i) => p.index === 0 && d.bindings[i].series_node === 10);
  d.points.splice(i, 1);
  d.bindings.splice(i, 1);
  p = ready(d);
  assert.equal(p.surface_cells.length, 1);
});
test('polygon clipping intersects plot without mutating vertices', () => {
  const a = [
      { x: -1, y: -1 },
      { x: 2, y: -1 },
      { x: 2, y: 2 },
      { x: -1, y: 2 },
    ],
    before = structuredClone(a),
    p = clipFamilyPolygon(a);
  assert.equal(p.length, 4);
  assert.deepEqual(a, before);
  assert(p.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
  assert.equal(clipFamilyPolygon([{ x: NaN, y: 0 }]), null);
});
test('painter validates all family data before Canvas calls and balances state on failure', () => {
  const g = familyGeometry('areaChart');
  g.polygons.push({
    series_node: 10,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: NaN },
      { x: 0, y: 1 },
    ],
  });
  const c = context();
  assert.equal(
    paintChartFamily(
      c.ctx,
      g,
      { width: 100, height: 100 },
      0,
      0,
      () => '#000',
      () => '#000',
    ),
    false,
  );
  assert.equal(c.calls.length, 0);
  const p = ready(model());
  p.family_geometry.polygons[0].points[0].y = Infinity;
  assert.equal(
    paintChartPreview(c.ctx, { x: 0, y: 0, width: 100, height: 100, primitives: p }, 0),
    false,
  );
  assert.equal(c.calls.length, 0);
  const good = ready(model()),
    throwing = context();
  throwing.ctx.fill = () => {
    throw Error('canvas');
  };
  assert.throws(
    () =>
      paintChartPreview(throwing.ctx, { x: 0, y: 0, width: 600, height: 400, primitives: good }, 0),
    /canvas/,
  );
  assert.equal(throwing.depth(), 0);
});

for (const kind of [
  'barChart',
  'bar3DChart',
  'lineChart',
  'scatterChart',
  'pieChart',
  'pie3DChart',
  'ofPieChart',
  'stockChart',
])
  test(`existing kind ${kind}: baseline geometry and Canvas calls unchanged`, () => {
    let d = model(
      kind,
      kind === 'stockChart'
        ? [
            [7, 8, 9],
            [1, 2, 3],
            [4, 5, 6],
          ]
        : [[1, 2, 3]],
    );
    const settings = d.plot_settings[0];
    settings.grouping = { node: 4, value: 'standard' };
    if (kind.startsWith('bar')) {
      settings.direction = { node: 5, value: 'col' };
      settings.grouping.value = 'clustered';
    }
    if (['pieChart', 'pie3DChart', 'ofPieChart'].includes(kind)) {
      d.axes = [];
      d.axis_links = [];
      settings.axis_references = [];
    }
    if (kind === 'scatterChart') {
      d = model('bubbleChart', [[1, 2, 3]]);
      d.plots[0].kind = kind;
      d.plot_settings[0].scatter_style = { node: 4, value: 'marker' };
      const keep = d.points
        .map((point, i) => ({ point, binding: d.bindings[i] }))
        .filter((r) => r.binding.role !== 'bubble_size');
      d.points = keep.map((r) => r.point);
      d.bindings = keep.map((r) => r.binding);
    }
    if (kind === 'bar3DChart') {
      camera(d);
      settings.spatial = { gap_depth: { node: 6, value: 150 }, shape: { node: 7, value: 'box' } };
    }
    if (kind === 'pie3DChart') {
      camera(d);
      d.view_3d.right_angle_axes.value = false;
      d.view_3d.perspective = { node: 956, value: 30 };
    }
    if (kind === 'stockChart') {
      settings.stock = {
        high_low_node: 600,
        up_down_node: null,
        up_node: null,
        down_node: null,
        gap_width: null,
      };
      d.series_settings.forEach((s, i) => {
        s.index = { value: i };
        s.order = { value: i };
      });
    }
    const before = structuredClone(d),
      a = baselineGoldens[kind].geometry,
      b = chartPreviewPrimitives(d);
    assert.equal(a.state, 'ready', JSON.stringify(a));
    assert.deepEqual(b, a);
    assert.deepEqual(d, before);
    const ca = baselineGoldens[kind],
      cb = context(),
      item = { x: 2, y: 3, width: 600, height: 400, primitives: a };
    assert.equal(ca.paintResult, true);
    assert.equal(paintChartPreview(cb.ctx, item, 0), true);
    assert.deepEqual(cb.calls, ca.canvasCalls);
  });
test('extreme polygon crossings remain finite within the plot', () => {
  const p = clipFamilyPolygon([
    { x: 0, y: -Number.MAX_VALUE },
    { x: 1, y: Number.MAX_VALUE },
    { x: 0, y: 0 },
  ]);
  assert(p);
  assert(p.every((v) => [v.x, v.y].every((x) => Number.isFinite(x) && x >= 0 && x <= 1)));
});

test('unrepresentable projections fail closed instead of coercing null to numeric zero', () => {
  for (const kind of ['areaChart', 'bubbleChart', 'surface3DChart']) {
    const d = proposed(
      camera(
        model(kind, [
          [1e308, 2, 3],
          [1, 2, 3],
        ]),
      ),
    );
    d.axes[0].scaling = {
      minimum: { value: { kind: 'finite', value: 1e-308 } },
      maximum: { value: { kind: 'finite', value: 2e-308 } },
    };
    assert.equal(chartPreviewPrimitives(d).reason, 'InvalidChartCoordinate');
  }
});
test('sphere and wireframe approximation disclosures reach the public Canvas painter', () => {
  const bubble = proposed(model('bubbleChart', [[1, 2, 3]]));
  bubble.plot_settings[0].bubble_3d.value = true;
  assert(paint(ready(bubble)).some((c) => c[0] === 'fillText' && String(c[1]).includes('구형')));
  const surface = proposed(model('surfaceChart'));
  surface.plot_settings[0].wireframe.value = true;
  assert(
    paint(ready(surface)).some(
      (c) => c[0] === 'fillText' && String(c[1]).includes('wireframe 근사'),
    ),
  );
});

test('radar with fewer than three categories renders markers or a single edge without polygon fill', () => {
  for (const style of ['standard', 'marker', 'filled']) {
    const one = proposed(model('radarChart', [[2]]));
    one.plot_settings[0].radar_style.value = style;
    const point = ready(one);
    assert.equal(point.family_geometry.circles.length, 1);
    assert.equal(point.family_geometry.strokes.length, 0);
    assert.equal(point.family_geometry.polygons.length, 0);
    paint(point);

    const two = proposed(model('radarChart', [[2, 3]]));
    two.plot_settings[0].radar_style.value = style;
    const edge = ready(two);
    assert.equal(edge.family_geometry.circles.length, style === 'marker' ? 2 : 0);
    assert.equal(edge.family_geometry.strokes.length, 1);
    assert.equal(edge.family_geometry.polygons.length, 0);
    paint(edge);
  }
});
