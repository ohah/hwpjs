import test from 'node:test';
import assert from 'node:assert/strict';
import { tableSemanticFaceFill } from '../../web/preview/table-semantic-face-fill.mjs';
import { tableBorderPaintPlan } from '../../web/preview/table-border-plan.mjs';
import { rgbCss } from '../../web/preview/rgb-css.mjs';

// Small source DTO only: no WASM, external fixture, build output or private path.
function source() {
  const raw = Array(19).fill(null);
  raw[0] = '#A5E7E7';
  raw[1] = '#FFFFFFFF';
  raw[3] = '0';
  return {
    id: 16,
    node: 50,
    fill_node: 100,
    unknown_children: 0,
    unknown_attributes: 0,
    three_d: '0',
    shadow: '0',
    center_line: 'NONE',
    slash: 'NONE',
    back_slash: 'NONE',
    edges: Array.from({ length: 4 }, () => ({ style: 'NONE', width: null, color: null })),
    fill_report: {
      brushes: [
        {
          part_kind: 'header',
          section_ordinal: null,
          element_index: 100,
          parent_element_index: 50,
          direct_children: 1,
          other_attributes: 0,
        },
      ],
      nodes: [
        {
          kind: 'win_brush',
          brush_index: 0,
          element_index: 101,
          direct_children: 0,
          other_attributes: 0,
          unknown_enums: 0,
          raw,
        },
      ],
    },
    semantic_face_colors: [{ node: 101, field: 'winBrush.faceColor', rgb: 0xe7e7a5 }],
    source_color_profile: { id: 'opaque-native-profile', encoding: 'colorref24', verified: true },
  };
}
const rawFill = () => ({ state: 'solid', color: '#A5E7E7' });
const unavailable = (value) => {
  assert.equal(value.state, 'unavailable');
  assert.equal(value.error, 'InvalidTableSemanticFaceColors');
  assert.equal(Object.hasOwn(value, 'color'), false);
};

test('Native semantic face is canonical RGB, owner bound, and leaves raw source unchanged', () => {
  const style = source(),
    before = structuredClone(style);
  assert.deepEqual(tableSemanticFaceFill(style, rawFill()), { state: 'solid', color: '#e7e7a5' });
  assert.deepEqual(tableBorderPaintPlan(style), {
    state: 'none',
    fill: { state: 'solid', color: '#e7e7a5' },
  });
  assert.deepEqual(style, before);
});

test('absent semantic DTO keeps legacy RGB and does not require an independent provenance query', () => {
  const style = source(),
    fill = rawFill();
  delete style.semantic_face_colors;
  assert.equal(tableSemanticFaceFill(style, fill), fill);
  assert.equal(tableBorderPaintPlan(style).fill.color, '#A5E7E7');
  const nativeOnly = source();
  delete nativeOnly.source_color_profile;
  assert.equal(tableBorderPaintPlan(nativeOnly).fill.color, '#e7e7a5');
});

test('explicit null semantic color remains unknown rather than guessing black or raw RGB', () => {
  const style = source();
  style.semantic_face_colors[0].rgb = null;
  assert.deepEqual(tableSemanticFaceFill(style, rawFill()), {
    state: 'unavailable',
    error: 'UnknownTableSemanticFaceColor',
  });
  const plan = tableBorderPaintPlan(style);
  assert.equal(plan.state, 'unavailable');
  assert.equal(plan.fill.error, 'UnknownTableSemanticFaceColor');
  assert(!plan.fill.color);
});

test('eleven plain JSON malformed raw nodes are unavailable even when fill_node is null', () => {
  const nodes = [null, 0, 1, false, true, '', 'x', [], {}, { kind: null }, { kind: 0 }];
  assert.equal(nodes.length, 11);
  for (const node of nodes) {
    const style = source();
    style.fill_node = null;
    style.semantic_face_colors = [];
    style.fill_report.nodes = [node];
    assert.doesNotThrow(() => tableSemanticFaceFill(style, undefined));
    unavailable(tableSemanticFaceFill(style, undefined));
    const plan = tableBorderPaintPlan(style);
    assert.equal(plan.state, 'unavailable');
    unavailable(plan.fill);
  }
});

test('semantic owner omissions, duplicates, foreign nodes and malformed values are refused', () => {
  const cases = [
    (s) => (s.semantic_face_colors = null),
    (s) => (s.semantic_face_colors = []),
    (s) => s.semantic_face_colors.push({ ...s.semantic_face_colors[0] }),
    (s) => (s.semantic_face_colors[0].node = 102),
    (s) => (s.semantic_face_colors[0].field = 'charPr.textColor'),
    (s) => (s.semantic_face_colors[0].rgb = 0x1000000),
    (s) => (s.semantic_face_colors[0].rgb = -1),
    (s) => (s.semantic_face_colors[0].rgb = 'E7E7A5'),
    (s) => (s.semantic_face_colors[0].extra = true),
    (s) => (s.source_color_profile = null),
  ];
  for (const change of cases) {
    const style = source();
    change(style);
    unavailable(tableSemanticFaceFill(style, rawFill()));
  }
  const duplicateSource = source();
  duplicateSource.fill_report.nodes.push(structuredClone(duplicateSource.fill_report.nodes[0]));
  unavailable(tableSemanticFaceFill(duplicateSource, rawFill()));
  const duplicateValue = source();
  duplicateValue.fill_report.nodes.push({
    ...structuredClone(duplicateValue.fill_report.nodes[0]),
    element_index: 102,
  });
  duplicateValue.semantic_face_colors.push({ ...duplicateValue.semantic_face_colors[0] });
  unavailable(tableSemanticFaceFill(duplicateValue, rawFill()));
});

test('RGB serialization has no channel swap and preserves existing unsupported paint policies', () => {
  for (const [value, css] of [
    [0, '#000000'],
    [0xff, '#0000ff'],
    [0xff0000, '#ff0000'],
    [0x123456, '#123456'],
    [0xffffff, '#ffffff'],
  ]) {
    assert.equal(rgbCss(value), css);
    const style = source();
    style.semantic_face_colors[0].rgb = value;
    assert.equal(tableBorderPaintPlan(style).fill.color, css);
  }
  for (const value of [null, undefined, -1, 0x1000000, NaN, Infinity, 1.5, '123456'])
    assert.equal(rgbCss(value), null);
  for (const state of ['pattern', 'linear_gradient', 'image', 'none', 'unavailable']) {
    const fill = { state, error: 'existing-error' };
    assert.equal(tableSemanticFaceFill(source(), fill), fill);
  }
  const unsupported = source();
  unsupported.unknown_children = 1;
  assert.deepEqual(tableBorderPaintPlan(unsupported), {
    state: 'unavailable',
    error: 'UnsupportedTableBorderPaint',
  });
});
