import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeChartDisplay } from '../../js/hwpx-chart-display.mjs';
import { chartFamilyFieldNames } from '../../js/chart-family-display-settings.mjs';
const packet = (value) => new TextEncoder().encode(JSON.stringify(value));
function base(kind = 'doughnutChart') {
  return {
    kind: 'chart_display',
    pair: {
      chart_path: 'Chart/authored.xml',
      ole_path: 'BinData/authored.ole',
      wrapper_node: 0,
      section_ordinal: 0,
      section_sha256: Array(32).fill(0),
      declared_external: false,
    },
    host: {
      wrapper_node: 0,
      chart_node: 2,
      geometry: {
        width: 100,
        height: 100,
        width_relative: 0,
        height_relative: 0,
        treat_as_character: true,
        horizontal_offset: 0,
        vertical_offset: 0,
      },
      position: { flags: [false, false, false, false], relations: [0, 0, 0, 0] },
    },
    plots: [{ node: 10, area_node: 2, kind, series_nodes: [20] }],
    plot_settings: [
      {
        direction: null,
        grouping: null,
        vary_colors: null,
        gap_width: null,
        overlap: null,
        scatter_style: null,
        first_slice_angle: null,
        of_pie_type: null,
        second_pie_size: null,
        split_type: null,
        split_position: null,
        custom_split_node: null,
        stock: null,
        axis_references: [],
      },
    ],
    series_settings: [
      {
        series_node: 20,
        plot_node: 10,
        index: null,
        order: null,
        marker: null,
        smooth: null,
        explosion: null,
      },
    ],
    point_settings: [],
    axes: [],
    axis_links: [],
    points: [],
    bindings: [],
    series_text: [],
    rich_text: [],
  };
}
function family(kind, values) {
  const value = base(kind),
    settings = value.plot_settings[0];
  Object.assign(settings, Object.fromEntries(chartFamilyFieldNames.map((key) => [key, null])));
  settings.family_unparsed_children = false;
  let node = 30;
  for (const [name, scalar] of Object.entries(values))
    settings[name] = { node: node++, value: scalar };
  return value;
}
const cases = [
  ['doughnutChart', { hole_size: 50 }],
  ['radarChart', { radar_style: 'marker' }],
  [
    'bubbleChart',
    { bubble_scale: 100, size_represents: 'area', show_negative_bubbles: false, bubble_3d: false },
  ],
  ['surfaceChart', { wireframe: false }],
  ['surface3DChart', { wireframe: true }],
];
test('five-family typed additive contract accepts explicit raw values and preserves identity/absence', () => {
  for (const [kind, fields] of cases) {
    const input = family(kind, fields);
    assert.deepEqual(decodeChartDisplay(packet(input)), input);
    for (const key of Object.keys(fields)) {
      const empty = structuredClone(input);
      empty.plot_settings[0][key].value = null;
      assert.deepEqual(decodeChartDisplay(packet(empty)), empty);
      const absent = structuredClone(input);
      absent.plot_settings[0][key] = null;
      assert.deepEqual(decodeChartDisplay(packet(absent)), absent);
    }
  }
});
test('old DTO omits capability without injecting family fields; partial additive group is rejected', () => {
  const old = base();
  assert.deepEqual(decodeChartDisplay(packet(old)), old);
  assert.equal(Object.hasOwn(old.plot_settings[0], 'hole_size'), false);
  const partial = base();
  partial.plot_settings[0].hole_size = { node: 30, value: 50 };
  assert.throws(() => decodeChartDisplay(packet(partial)), /InvalidChartDisplay/);
  for (const coverage of [null, undefined, 0, 'false']) {
    const invalid = family('doughnutChart', { hole_size: 50 });
    invalid.plot_settings[0].family_unparsed_children = coverage;
    assert.throws(() => decodeChartDisplay(packet(invalid)), /InvalidChartDisplay/);
  }
});
test('ranges, enums, kinds, missing values and invalid owner identities fail closed', () => {
  for (const [kind, key, bad] of [
    ['doughnutChart', 'hole_size', 9],
    ['doughnutChart', 'hole_size', 91],
    ['doughnutChart', 'hole_size', 50.5],
    ['radarChart', 'radar_style', 'polygon'],
    ['bubbleChart', 'bubble_scale', 301],
    ['bubbleChart', 'bubble_scale', -1],
    ['bubbleChart', 'size_represents', 'diameter'],
    ['bubbleChart', 'bubble_3d', 0],
    ['bubbleChart', 'show_negative_bubbles', 'false'],
    ['surfaceChart', 'wireframe', 'false'],
  ]) {
    const value = family(kind, { [key]: bad });
    assert.throws(() => decodeChartDisplay(packet(value)), /InvalidChartDisplay/);
  }
  const wrong = family('barChart', { hole_size: 50 });
  wrong.plot_settings[0].family_unparsed_children = null;
  assert.throws(() => decodeChartDisplay(packet(wrong)), /InvalidChartDisplay/);
  for (const mutate of [
    (v) => {
      v.plot_settings[0].hole_size.node = 10;
    },
    (v) => {
      delete v.plot_settings[0].hole_size.value;
    },
  ]) {
    const value = family('doughnutChart', { hole_size: 50 });
    mutate(value);
    assert.throws(() => decodeChartDisplay(packet(value)), /InvalidChartDisplay/);
  }
});
test('coverage true is retained and is never silently changed to false', () => {
  for (const [kind, fields] of cases) {
    const value = family(kind, fields);
    value.plot_settings[0].family_unparsed_children = true;
    assert.equal(decodeChartDisplay(packet(value)).plot_settings[0].family_unparsed_children, true);
  }
});
test('family node claims reject aliases to all observed chart graph owners and leaves', () => {
  const original = family('doughnutChart', { hole_size: 80 });
  original.series_settings[0].index = { node: 21, value: 0 };
  original.series_settings[0].order = { node: 22, value: 0 };
  original.series_settings[0].stroke = { node: 23, no_fill_node: 24 };
  original.series_text = [{ series_node: 20, text_node: 25, value_node: 26, text: 'S' }];
  original.points = [
    {
      cache_node: 40,
      point_node: 41,
      value_node: 42,
      index: 0,
      kind: 'numeric_literal',
      level_node: null,
      value: '3',
    },
  ];
  original.bindings = [{ point: 0, series_node: 20, plot_node: 10, role_node: 39, role: 'value' }];
  original.point_settings = [
    {
      node: 43,
      series_node: 20,
      plot_node: 10,
      index: { node: 44, value: 0 },
      explosion: null,
      unparsed_children: false,
    },
  ];
  original.blank_policy = { node: 45, value: 'gap' };
  original.view_3d = {
    node: 1,
    rotation_x: { node: 46, value: 30 },
    rotation_y: null,
    height_percent: null,
    depth_percent: null,
    right_angle_axes: null,
    perspective: null,
    unparsed_children: false,
  };
  assert.deepEqual(decodeChartDisplay(packet(original)), original);
  for (const node of [20, 21, 22, 23, 24, 25, 26, 39, 40, 41, 42, 43, 44, 45, 46]) {
    const value = structuredClone(original);
    value.plot_settings[0].hole_size.node = node;
    assert.throws(() => decodeChartDisplay(packet(value)), /InvalidChartDisplay/, `alias ${node}`);
  }
  const separate = structuredClone(original);
  separate.host.chart_node = 30;
  assert.deepEqual(
    decodeChartDisplay(packet(separate)),
    separate,
    'section and chart node spaces remain separate',
  );
});
test('family fields cannot claim a node from a later plot or axis interval', () => {
  const value = family('doughnutChart', { hole_size: 50 });
  value.plots.push({ node: 100, area_node: 2, kind: 'pieChart', series_nodes: [] });
  value.plot_settings.push({ ...base().plot_settings[0] });
  assert.deepEqual(decodeChartDisplay(packet(value)), value);
  value.plot_settings[0].hole_size.node = 101;
  assert.throws(() => decodeChartDisplay(packet(value)), /InvalidChartDisplay/);
  const duplicate = family('bubbleChart', {
    bubble_scale: 100,
    size_represents: 'w',
    show_negative_bubbles: false,
    bubble_3d: false,
  });
  duplicate.plot_settings[0].size_represents.node = 30;
  assert.throws(() => decodeChartDisplay(packet(duplicate)), /InvalidChartDisplay/);
});
test('scatter none is a valid explicit read scalar, not a category or style fallback', () => {
  const value = base('scatterChart');
  value.plot_settings[0].scatter_style = { node: 30, value: 'none' };
  assert.equal(decodeChartDisplay(packet(value)).plot_settings[0].scatter_style.value, 'none');
});
