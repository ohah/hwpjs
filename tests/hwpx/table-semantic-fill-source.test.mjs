import test from 'node:test';
import assert from 'node:assert/strict';
import { tableBorderPaintPlan } from '../../web/preview/table-border-plan.mjs';
import { tableSemanticFillProjection } from '../../web/preview/table-semantic-fill-source.mjs';
import { selectedFillPlan } from '../../web/preview/selected-fill-plan.mjs';

// Synthetic Source grammar only: no document bytes, parser, producer inference or saved DTO.
const semantic = (node, field, rgb) => ({ node, field, rgb });
const node = (kind, index, parent = null, children = 0) => ({
  kind,
  element_index: index,
  parent_node_index: parent,
  brush_index: 0,
  direct_children: children,
  other_attributes: 0,
  unknown_enums: 0,
  non_six_hex_colors: 0,
  raw: Array(19).fill(null),
});
function source(nodes) {
  return {
    node: 10,
    fill_node: 11,
    unknown_children: 0,
    unknown_attributes: 0,
    three_d: '0',
    shadow: 'false',
    center_line: 'NONE',
    slash: 'NONE',
    back_slash: 'NONE',
    edges: Array.from({ length: 4 }, () => ({ style: 'NONE' })),
    fill_report: {
      brushes: [
        {
          part_kind: 'header',
          section_ordinal: null,
          element_index: 11,
          parent_element_index: 10,
          direct_children: 1,
          other_attributes: 0,
        },
      ],
      nodes,
    },
  };
}
function solid() {
  const n = node('win_brush', 12);
  n.raw[0] = '#A5E7E7';
  n.raw[1] = '#FFFFFFFF';
  n.raw[3] = '0';
  return source([n]);
}
function pattern() {
  const s = solid(),
    n = s.fill_report.nodes[0];
  n.raw[0] = '#FFCC99';
  n.raw[1] = '#FF9900';
  n.raw[2] = 'VERTICAL';
  return s;
}
function gradient() {
  const root = node('gradation', 12, null, 2),
    a = node('color', 13, 0),
    b = node('color', 14, 0);
  for (const [slot, value] of [
    [4, 'LINEAR'],
    [5, '0'],
    [6, '0'],
    [7, '0'],
    [8, '3'],
    [9, '2'],
    [10, '50'],
    [11, '0'],
  ])
    root.raw[slot] = value;
  a.raw[13] = '#563412';
  b.raw[13] = '#2080C0';
  return source([root, a, b]);
}
function withFace(s, color) {
  s.semantic_face_colors = [semantic(12, 'winBrush.faceColor', color)];
  return s;
}
function genericPattern() {
  const s = withFace(pattern(), 0x99ccff);
  s.semantic_fill_colors = [
    semantic(12, 'winBrush.faceColor', 0x99ccff),
    semantic(12, 'winBrush.hatchColor', 0x0099ff),
  ];
  return s;
}
function genericSolid() {
  const s = withFace(solid(), 0xe7e7a5);
  s.semantic_fill_colors = [
    semantic(12, 'winBrush.faceColor', 0xe7e7a5),
    semantic(12, 'winBrush.hatchColor', null),
  ];
  return s;
}
function genericGradient() {
  const s = gradient();
  s.semantic_face_colors = [];
  s.semantic_fill_colors = [
    semantic(13, 'color.value', 0x123456),
    semantic(14, 'color.value', 0xc08020),
  ];
  return s;
}
const selected = (s) => ({
  state: 'selected',
  brush: s.fill_report.brushes[0],
  nodes: s.fill_report.nodes,
  report: s.fill_report,
});
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};
const unavailable = (s) => {
  const result = tableBorderPaintPlan(s);
  assert.equal(result.state, 'unavailable');
  assert.notEqual(result.fill?.state, 'pattern');
  return result;
};

test('absent b7 semantics retain literal raw solid, pattern and gradient colors', () => {
  assert.deepEqual(tableBorderPaintPlan(solid()), {
    state: 'none',
    fill: { state: 'solid', color: '#A5E7E7' },
  });
  assert.deepEqual(tableBorderPaintPlan(pattern()).fill, {
    state: 'pattern',
    background: '#FFCC99',
    color: '#FF9900',
    kind: 'VERTICAL',
    rasterParity: 'unverified',
  });
  assert.deepEqual(tableBorderPaintPlan(gradient()).fill.stops, [
    { offset: 0, color: '#563412' },
    { offset: 0.25, color: '#563412' },
    { offset: 0.25, color: '#3b5a69' },
    { offset: 0.75, color: '#3b5a69' },
    { offset: 0.75, color: '#2080c0' },
    { offset: 1, color: '#2080c0' },
  ]);
});
test('d63 face-only compatibility changes solid and pattern background, never raw hatch', () => {
  assert.equal(tableBorderPaintPlan(withFace(solid(), 0xe7e7a5)).fill.color, '#e7e7a5');
  assert.deepEqual(tableBorderPaintPlan(withFace(pattern(), 0x99ccff)).fill, {
    state: 'pattern',
    background: '#99ccff',
    color: '#FF9900',
    kind: 'VERTICAL',
    rasterParity: 'unverified',
  });
});
test('generic canonical values are the only new solid/pattern truth, independent of profile classification', () => {
  assert.equal(tableBorderPaintPlan(genericSolid()).fill.color, '#e7e7a5');
  const s = genericPattern();
  for (const profile of [
    { id: 'unknown', encoding: 'rgb24', verified: false },
    { id: 'opaque', encoding: 'colorref24', verified: true },
  ]) {
    s.source_color_profile = profile;
    assert.deepEqual(tableBorderPaintPlan(s).fill, {
      state: 'pattern',
      background: '#99ccff',
      color: '#0099ff',
      kind: 'VERTICAL',
      rasterParity: 'unverified',
    });
  }
});
test('generic-only works; compatible face view is checked by value and conflicts refuse fallback', () => {
  const s = genericPattern();
  delete s.semantic_face_colors;
  assert.equal(tableBorderPaintPlan(s).fill.background, '#99ccff');
  s.semantic_face_colors = [{ rgb: 0x99ccff, field: 'winBrush.faceColor', node: 12 }];
  assert.equal(tableBorderPaintPlan(s).fill.background, '#99ccff');
  s.semantic_face_colors[0].rgb = 0x123456;
  assert.equal(unavailable(s).fill.error, 'InvalidTableSemanticFillColors');
});
test('inactive sentinel null is allowed; active face, hatch and gradient null stay unavailable', () => {
  const s = genericSolid();
  s.fill_report.nodes[0].non_six_hex_colors = 1;
  assert.equal(tableBorderPaintPlan(s).fill.color, '#e7e7a5');
  s.semantic_fill_colors[0].rgb = null;
  s.semantic_face_colors[0].rgb = null;
  assert.equal(unavailable(s).fill.error, 'UnknownTableSemanticFillColor');
  const p = genericPattern();
  p.semantic_fill_colors[1].rgb = null;
  assert.equal(unavailable(p).fill.error, 'UnknownTableSemanticFillColor');
  const g = genericGradient();
  g.semantic_fill_colors[0].rgb = null;
  assert.equal(unavailable(g).fill.error, 'UnknownTableSemanticFillColor');
});
test('gradient projection occurs before interpolation; independent middle and offsets are exact', () => {
  const s = genericGradient(),
    sel = selected(s),
    projection = tableSemanticFillProjection(s, sel);
  let calls = 0;
  const actual = selectedFillPlan(sel, (input) => {
    calls++;
    assert.equal(input.state, 'gradient_source');
    assert.deepEqual(input.colors, ['#563412', '#2080C0']);
    assert.equal(Object.hasOwn(input, 'stops'), false);
    const normalized = projection.project(input);
    assert.deepEqual(normalized.colors, ['#123456', '#c08020']);
    return normalized;
  });
  assert.equal(calls, 1);
  assert.deepEqual(actual, {
    state: 'linear_gradient',
    angle: 0,
    stops: [
      { offset: 0, color: '#123456' },
      { offset: 0.25, color: '#123456' },
      { offset: 0.25, color: '#695a3b' },
      { offset: 0.75, color: '#695a3b' },
      { offset: 0.75, color: '#c08020' },
      { offset: 1, color: '#c08020' },
    ],
    rasterParity: 'unverified',
  });
  assert.deepEqual(tableBorderPaintPlan(s).fill, actual);
});
test('malformed semantic inventories reject exact-key, color-range, duplicate and missing rows', () => {
  const changes = [
    (s) => (s.semantic_fill_colors = null),
    (s) => (s.semantic_fill_colors[0] = null),
    (s) => (s.semantic_fill_colors[0] = false),
    (s) => (s.semantic_fill_colors[0].field = 'other'),
    (s) => (s.semantic_fill_colors[0].field = ['winBrush.faceColor']),
    (s) => delete s.semantic_fill_colors[0].rgb,
    (s) => (s.semantic_fill_colors[0].extra = 0),
    (s) => (s.semantic_fill_colors[0].rgb = -1),
    (s) => (s.semantic_fill_colors[0].rgb = 0x1000000),
    (s) => (s.semantic_fill_colors[0].rgb = '99ccff'),
    (s) => (s.semantic_fill_colors[0].rgb = 0.5),
    (s) => (s.semantic_fill_colors[0].node = 999),
    (s) => s.semantic_fill_colors.push({ ...s.semantic_fill_colors[0] }),
    (s) => s.semantic_fill_colors.pop(),
    (s) => (s.semantic_face_colors = null),
    (s) => s.semantic_face_colors.push({ ...s.semantic_face_colors[0] }),
    (s) => (s.source_color_profile = { id: 'unknown' }),
  ];
  for (const change of changes) {
    const s = genericPattern();
    change(s);
    unavailable(s);
  }
});
test('source owners, kinds, parent ancestry and exact selected objects cannot be forged', () => {
  for (const change of [
    (s) => (s.fill_report.brushes[0] = null),
    (s) => (s.fill_report.brushes[0] = false),
    (s) => (s.fill_report.brushes[0].parent_element_index = 99),
    (s) => (s.fill_report.nodes[0] = null),
    (s) => (s.fill_report.nodes[0] = []),
    (s) => (s.fill_report.nodes[0].raw.length = 2),
    (s) => (s.fill_report.nodes[0].brush_index = 1),
    (s) => (s.fill_report.nodes[0].kind = 'image'),
  ]) {
    const s = genericPattern();
    change(s);
    unavailable(s);
  }
  const s = genericPattern(),
    sel = selected(s);
  for (const input of [
    { ...sel, nodes: [...sel.nodes] },
    { ...sel, brush: { ...sel.brush } },
    { ...sel, report: { ...sel.report } },
  ])
    assert.equal(tableSemanticFillProjection(s, input).state, 'unavailable');
  for (const parent of [null, 1, 999]) {
    const g = genericGradient();
    g.fill_report.nodes[1].parent_node_index = parent;
    unavailable(g);
  }
  const g = genericGradient();
  g.fill_report.nodes[1].element_index = 12;
  unavailable(g);
});
test('unsupported source expressions and gradient variants are not upgraded by numeric semantics', () => {
  const p = genericPattern();
  p.fill_report.nodes[0].raw[1] = '#FFFFFFFF';
  unavailable(p);
  const radial = genericGradient();
  radial.fill_report.nodes[0].raw[4] = 'RADIAL';
  assert.equal(unavailable(radial).fill.error, 'UnsupportedDrawingGradientPlan');
  const mixed = genericGradient();
  mixed.fill_report.brushes[0].direct_children = 2;
  mixed.fill_report.nodes.push(node('img_brush', 15));
  assert.equal(unavailable(mixed).fill.error, 'UnsupportedDrawingGradientVariant');
});
test('frozen raw source stays unchanged; equal node IDs across A-B-A never share colors', () => {
  const a = freeze(genericPattern()),
    before = structuredClone(a),
    b = genericPattern();
  b.semantic_fill_colors[0].rgb = 0x112233;
  b.semantic_face_colors[0].rgb = 0x112233;
  b.semantic_fill_colors[1].rgb = 0x445566;
  assert.equal(tableBorderPaintPlan(a).fill.color, '#0099ff');
  assert.deepEqual(tableBorderPaintPlan(b).fill, {
    state: 'pattern',
    background: '#112233',
    color: '#445566',
    kind: 'VERTICAL',
    rasterParity: 'unverified',
  });
  assert.equal(tableBorderPaintPlan(a).fill.color, '#0099ff');
  assert.deepEqual(a, before);
});
test('no-brush accepts absent/empty generic only; malformed source helper refuses safely', () => {
  const s = source([]);
  s.fill_node = null;
  s.fill_report = null;
  assert.deepEqual(tableBorderPaintPlan(s), { state: 'none' });
  s.semantic_fill_colors = [];
  assert.deepEqual(tableBorderPaintPlan(s), { state: 'none' });
  s.semantic_fill_colors = [semantic(12, 'winBrush.faceColor', 0)];
  unavailable(s);
  s.semantic_fill_colors = null;
  unavailable(s);
  for (const value of [null, false, 0, 'x', []])
    assert.equal(tableSemanticFillProjection(value, null).state, 'unavailable');
});
test('optional hook defaults preserve ordinary drawing plans and unsupported results', () => {
  assert.deepEqual(selectedFillPlan(selected(solid())), { state: 'solid', color: '#A5E7E7' });
  assert.deepEqual(selectedFillPlan(selected(pattern())), {
    state: 'pattern',
    background: '#FFCC99',
    color: '#FF9900',
    kind: 'VERTICAL',
    rasterParity: 'unverified',
  });
  assert.deepEqual(selectedFillPlan({ state: 'none' }), { state: 'none' });
  const g = gradient();
  g.fill_report.nodes[0].raw[4] = 'RADIAL';
  assert.deepEqual(selectedFillPlan(selected(g)), {
    state: 'unavailable',
    error: 'UnsupportedDrawingGradientPlan',
  });
});
