import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tableSemanticFillProjection } from '../../web/preview/table-semantic-fill-source.mjs';
import { selectedFillPlan } from '../../web/preview/selected-fill-plan.mjs';
const actual = JSON.parse(
  readFileSync(new URL('../fixtures/own-created-cell-minimal-colorref.json', import.meta.url)),
);
const source = () => structuredClone(actual.solid.styles.find((s) => s.id === 0));
const selected = (s) => ({
  state: 'selected',
  report: s.fill_report,
  brush: s.fill_report.brushes[0],
  nodes: s.fill_report.nodes,
});
function plan(s) {
  const value = selected(s),
    projection = tableSemanticFillProjection(s, value);
  return projection.state === 'ready' ? selectedFillPlan(value, projection.project) : projection;
}
test('actual c090 old-profile saved created solid reads canonical 123456', () => {
  const s = source(),
    before = structuredClone(s);
  assert.deepEqual(s.source_color_profile, {
    id: 'hangul-10.0.0.5060-xml1.2',
    encoding: 'colorref24',
    verified: true,
  });
  assert.equal(s.fill_report.nodes[0].raw[0], '#563412');
  assert.deepEqual(plan(s), { state: 'solid', color: '#123456' });
  assert.deepEqual(s, before);
});
const bad = {
  'unknown profile': (s) => (s.source_color_profile.id = 'unknown'),
  'unverified profile': (s) => (s.source_color_profile.verified = false),
  'incorrect encoding': (s) => (s.source_color_profile.encoding = 'rgb24'),
  'other verified profile': (s) =>
    (s.source_color_profile = {
      id: 'hangul-12.0.0.4426-xml1.5',
      encoding: 'rgb24',
      verified: true,
    }),
  'raw semantic mismatch': (s) => (s.fill_report.nodes[0].raw[0] = '#123456'),
  'missing semantic color': (s) => (s.semantic_fill_colors = []),
  'foreign resource child': (s) => (s.unknown_children = 1),
  'foreign resource attribute': (s) => (s.unknown_attributes = 1),
  'explicit alpha one': (s) => (s.fill_report.nodes[0].raw[3] = '1'),
  'hatch metadata': (s) => (s.fill_report.nodes[0].raw[1] = '#000000'),
  'foreign section brush': (s) => (s.fill_report.brushes[0].part_kind = 'section'),
  'extra fill node': (s) =>
    s.fill_report.nodes.push({ ...s.fill_report.nodes[0], element_index: 999 }),
};
for (const [name, mutate] of Object.entries(bad))
  test(name + ' rejects minimum compatibility', () => {
    const s = source();
    mutate(s);
    assert.notEqual(plan(s).state, 'solid');
  });
test('actual alpha-absent drawing selector keeps rejection', () =>
  assert.equal(selectedFillPlan(selected(source())).state, 'unavailable'));
test('actual saved none keeps absent brush and semantic colors', () => {
  const style = actual.none.styles.find((s) => s.id === 1);
  assert.equal(style.fill_node, null);
  assert.equal(style.fill_report, null);
  assert.deepEqual(style.semantic_fill_colors, []);
  const p = tableSemanticFillProjection(style, null);
  assert.equal(p.state, 'ready');
  assert.deepEqual(p.project({ state: 'none' }), { state: 'none' });
});
