import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFamily3D, chartFamily3DProjection } from '../../web/preview/chart-family-3d.mjs';
import {
  unavailable,
  familyGeometry,
  addFamilyPolygon,
  addFamilyStroke,
} from '../../web/preview/chart-family-geometry.mjs';
function oldProjectFamily3D(display, plotNode, layout, line = false) {
  if (layout.state !== 'ready') return layout;
  const index = display.plots.findIndex((p) => p.node === plotNode),
    kind = display.plots[index].kind;
  const camera = chartFamily3DProjection(display, display.plot_settings[index]);
  if (camera.state !== 'ready') return camera;
  const g = familyGeometry(kind),
    nodes = display.plots[index].series_nodes;
  const zFor = (node) => (nodes.length <= 1 ? 0.5 : 1 - nodes.indexOf(node) / (nodes.length - 1));
  if (line)
    for (const row of layout.lines)
      for (const path of row.paths)
        for (let i = 1; i < path.length; i++) {
          if (
            !addFamilyStroke(
              g,
              camera.project(path[i - 1], zFor(row.series_node)),
              camera.project(path[i], zFor(row.series_node)),
              row.series_node,
            )
          )
            return unavailable('InvalidChartCoordinate');
        }
  else
    for (const polygon of layout.family_geometry.polygons) {
      if (
        !addFamilyPolygon(
          g,
          polygon.points.map((p) => camera.project(p, zFor(polygon.series_node))),
          polygon.series_node,
        )
      )
        return unavailable('InvalidChartCoordinate');
    }
  // Back to front series planes. No source camera/perspective fidelity claim.
  g.polygons.sort((a, b) => zFor(b.series_node) - zFor(a.series_node));
  g.strokes.sort((a, b) => zFor(b.series_node) - zFor(a.series_node));
  const {
    lines: _lines,
    area_rows: _areaRows,
    family_geometry: _familyGeometry,
    ...metadata
  } = layout;
  return {
    ...metadata,
    axes_hidden: { value: true, category: true },
    family_geometry: g,
    warnings: [
      ...layout.warnings,
      'PreviewRightAngleShear',
      'PreviewNormalized3DDepth',
      'Preview3DAxesOmitted',
      'Preview3DSeriesPlanes',
      ...(line ? ['SourceMarkersNotApplied'] : []),
    ],
  };
}
function display(nodes) {
  return {
    plots: [{ node: 100, kind: 'area3DChart', series_nodes: nodes }],
    plot_settings: [{ spatial: { gap_depth: { value: 150 } } }],
    view_3d: {
      node: 1,
      unparsed_children: false,
      rotation_x: { node: 2, value: 30 },
      rotation_y: { node: 3, value: 40 },
      height_percent: { node: 4, value: 100 },
      depth_percent: { node: 5, value: 100 },
      perspective: null,
      right_angle_axes: { node: 6, value: true },
    },
    // Raw metadata and other-plot decoys cannot become the source ordinal inventory.
    series: [{ node: 9000 }, { node: 20 }],
    raw_source: { series_nodes: [9000, 20] },
  };
}
const polygon = (series_node, n) => ({
  series_node,
  points: [
    { x: 0.1 + n / 10000, y: 0.1 },
    { x: 0.8, y: 0.3 },
    { x: 0.6, y: 0.9 },
  ],
});
function layout(order) {
  return {
    state: 'ready',
    tag: 'metadata survives',
    warnings: ['original'],
    lines: order.map((series_node, i) => ({
      series_node,
      paths: [
        [
          { x: 0.1, y: i / (order.length + 1) },
          { x: 0.5, y: 0.8 },
          { x: 0.8, y: 0.2 },
        ],
      ],
    })),
    area_rows: [{ ignored: true }],
    family_geometry: { polygons: order.map(polygon) },
  };
}
function parity(nodes, order) {
  const d = display(nodes),
    input = layout(order),
    before = structuredClone(input);
  for (const line of [false, true])
    assert.deepEqual(projectFamily3D(d, 100, input, line), oldProjectFamily3D(d, 100, input, line));
  assert.deepEqual(input, before);
}
test('full primitive output equals the old algorithm for valid/reversed/duplicate first ordinals and metadata decoys', () => {
  for (const nodes of [
    [10, 20, 30],
    [30, 20, 10],
    [10, 10, 20],
    [20, 10, 20, 30],
  ])
    parity(nodes, [20, 10, 30, 20, 9000, 10, 9000]);
});
test('unknown ordinal -1 and same-plane stable input order retain exact old clipped geometry', () => {
  parity([10, 20, 30], [9001, 30, 9000, 10, 30, 20, 9001]);
  parity([NaN, 10, 20], [NaN, 20, 10, NaN, 9000]);
  parity([-0, 20, 0], [0, 20, -0, 9000]);
  const reference = {},
    other = {};
  parity([reference, 20, reference], [reference, other, 20, other]);
  const flatCamera = display([30, 10, 20, 30]),
    sameDepth = layout([20, 30, 10, 20, 9000, 30]);
  flatCamera.view_3d.rotation_x.value = 0;
  flatCamera.view_3d.rotation_y.value = 0;
  for (const line of [false, true])
    assert.deepEqual(
      projectFamily3D(flatCamera, 100, sameDepth, line),
      oldProjectFamily3D(flatCamera, 100, sameDepth, line),
    );
});
test('zero/single-series midpoint behavior never reorders known or unknown planes', () => {
  for (const nodes of [[], [10], [NaN]]) parity(nodes, [20, 10, 30, 9000, 10]);
});
test('sparse source holes stay absent while explicitly present undefined retains indexOf semantics', () => {
  const sparse = [];
  sparse.length = 4;
  sparse[1] = 20;
  sparse[3] = 10;
  parity(sparse, [undefined, 20, 10, undefined]);
  sparse[0] = undefined;
  parity(sparse, [undefined, 20, 10, undefined]);
});
test('layout and camera refusal contracts remain exactly the old result rather than inventing permissive defaults', () => {
  const d = display([10, 20]),
    input = layout([10]);
  const notReady = { state: 'unavailable', reason: 'source refused' };
  assert.strictEqual(projectFamily3D(d, 100, notReady), notReady);
  for (const change of [
    (v) => (v.view_3d = null),
    (v) => (v.view_3d.unparsed_children = true),
    (v) => (v.view_3d.right_angle_axes.value = false),
    (v) => (v.plot_settings[0].spatial.gap_depth.value = null),
  ]) {
    const next = structuredClone(d);
    change(next);
    assert.deepEqual(projectFamily3D(next, 100, input), oldProjectFamily3D(next, 100, input));
  }
  const invalid = layout([10]);
  invalid.family_geometry.polygons[0].points[0].x = Infinity;
  assert.deepEqual(projectFamily3D(d, 100, invalid), oldProjectFamily3D(d, 100, invalid));
});
test('large polygon and stroke geometry uses one source ordinal scan and neither indexOf nor sort', () => {
  const count = 600,
    nodes = Array.from({ length: count }, (_, i) => 1000 + i),
    order = [...nodes].reverse().flatMap((node) => [node, node]);
  const input = layout(order),
    d = display(nodes);
  const expected = [oldProjectFamily3D(d, 100, input), oldProjectFamily3D(d, 100, input, true)];
  let reads = 0;
  d.plots[0].series_nodes = new Proxy(nodes, {
    get(array, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
      return Reflect.get(array, key, receiver);
    },
  });
  const oldIndexOf = Array.prototype.indexOf,
    oldSort = Array.prototype.sort;
  let actual;
  try {
    Array.prototype.indexOf = () => {
      throw Error('per-point indexOf forbidden');
    };
    Array.prototype.sort = () => {
      throw Error('comparison sort forbidden');
    };
    actual = [projectFamily3D(d, 100, input), projectFamily3D(d, 100, input, true)];
  } finally {
    Array.prototype.indexOf = oldIndexOf;
    Array.prototype.sort = oldSort;
  }
  assert.deepEqual(actual, expected);
  assert.equal(reads, count * 2, 'each of two projections reads each source ordinal once');
});
