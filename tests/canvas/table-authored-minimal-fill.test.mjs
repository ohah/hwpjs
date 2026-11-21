import test from 'node:test';
import assert from 'node:assert/strict';
import { tableSemanticFillProjection } from '../../web/preview/table-semantic-fill-source.mjs';
import { selectedFillPlan } from '../../web/preview/selected-fill-plan.mjs';
// Own canonical writer shape: <winBrush faceColor="#123456"/> in an owned header resource.
function own() {
  const node = {
    kind: 'win_brush',
    brush_index: 0,
    parent_node_index: null,
    element_index: 30,
    raw: ['#123456', ...Array(18).fill(null)],
    attribute_bytes: 7,
    other_attributes: 0,
    unknown_enums: 0,
    non_six_hex_colors: 0,
    direct_children: 0,
    recognized_children: 0,
  };
  const brush = {
    part_kind: 'header',
    part_item_index: 0,
    section_ordinal: null,
    element_index: 29,
    parent_element_index: 24,
    child_counts: [1, 0, 0],
    other_attributes: 0,
    direct_children: 1,
  };
  const value = { node: 30, field: 'winBrush.faceColor', rgb: 0x123456 };
  return {
    node: 24,
    fill_node: 29,
    unknown_attributes: 0,
    unknown_children: 0,
    source_color_profile: { id: 'hwpjs-authored-v1-rgb24', encoding: 'rgb24', verified: true },
    semantic_fill_colors: [value],
    semantic_face_colors: [{ ...value }],
    fill_report: {
      header_and_sections: 1,
      master_pages: 0,
      brushes: [brush],
      nodes: [node],
      kind_counts: [1, 0, 0, 0, 0],
      other_attributes: 0,
      unknown_enums: 0,
      non_six_hex_colors: 0,
      attribute_bytes: 7,
      direct_children: 1,
      color_count_mismatch: 0,
    },
  };
}
function selected(style) {
  const r = style.fill_report;
  return { state: 'selected', report: r, brush: r.brushes[0], nodes: r.nodes };
}
function plan(style) {
  const s = selected(style),
    p = tableSemanticFillProjection(style, s);
  return p.state === 'ready' ? selectedFillPlan(s, p.project) : p;
}
test('verified authored sole-faceColor table brush reads saved opaque RGB without mutating source', () => {
  const s = own(),
    before = structuredClone(s);
  assert.deepEqual(plan(s), { state: 'solid', color: '#123456' });
  assert.deepEqual(s, before);
});
const negatives = {
  'unknown producer': (s) => (s.source_color_profile.id = 'unapproved'),
  'unverified producer': (s) => (s.source_color_profile.verified = false),
  'different encoding': (s) => (s.source_color_profile.encoding = 'colorref24'),
  'missing profile': (s) => delete s.source_color_profile,
  'explicit nonzero alpha': (s) => (s.fill_report.nodes[0].raw[3] = '1'),
  'explicit hatch metadata': (s) => (s.fill_report.nodes[0].raw[1] = '#000000'),
  'explicit hatch style': (s) => (s.fill_report.nodes[0].raw[2] = 'HORIZONTAL'),
  'unexpected raw slot': (s) => (s.fill_report.nodes[0].raw[18] = '0'),
  'unknown resource attribute': (s) => (s.unknown_attributes = 1),
  'unknown resource child': (s) => (s.unknown_children = 1),
  'unknown brush attribute': (s) => (s.fill_report.brushes[0].other_attributes = 1),
  'unknown node attribute': (s) => (s.fill_report.nodes[0].other_attributes = 1),
  'node child': (s) => (s.fill_report.nodes[0].direct_children = 1),
  'mixed fill nodes': (s) =>
    s.fill_report.nodes.push({ ...s.fill_report.nodes[0], kind: 'img_brush', element_index: 31 }),
  'foreign part': (s) => (s.fill_report.brushes[0].part_kind = 'section'),
  'wrong owner': (s) => (s.fill_report.brushes[0].parent_element_index = 99),
  'semantic color mismatch': (s) => {
    s.semantic_fill_colors[0].rgb = 0xabcdef;
    s.semantic_face_colors[0].rgb = 0xabcdef;
  },
  'missing semantic color': (s) => (s.semantic_fill_colors = []),
  'color count mismatch': (s) => (s.fill_report.color_count_mismatch = 1),
};
for (const [name, change] of Object.entries(negatives))
  test(name + ' does not receive table compatibility', () => {
    const s = own();
    change(s);
    assert.notEqual(plan(s).state, 'solid');
  });
test('direct drawing selector still rejects absent alpha even with otherwise identical brush', () =>
  assert.equal(selectedFillPlan(selected(own())).state, 'unavailable'));
test('existing explicit zero alpha stays supported by original shared policy', () => {
  const s = own();
  s.fill_report.nodes[0].raw[3] = '0';
  assert.deepEqual(selectedFillPlan(selected(s)), { state: 'solid', color: '#123456' });
});
