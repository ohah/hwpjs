import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hwp5TableBorderPaintPlan,
  hwp5TableBorderPaintIndex,
} from '../../web/preview/hwp5-table-border-plan.mjs';
import { attachHwp5TableBorderSources } from '../../web/preview/hwp5-table-border-content.mjs';
const style = () => ({
  id: 1,
  attributes: 0,
  fill_known: true,
  fill_flags: 1,
  unknown_fill_bytes: null,
  extra_bytes: 0,
  additional_bytes: 0,
  pattern: { background: 0x030201, foreground: 0, kind: -1 },
  image: null,
  gradient: null,
  alpha: { pattern: 0, gradient: null, image: null },
  borders: Array.from({ length: 5 }, () => ({ kind: 1, width: 0, color: 0x060504 })),
});
test('native table fills retain BGR color order and remain independent of unsupported borders', () => {
  const s = style(),
    before = structuredClone(s),
    plan = hwp5TableBorderPaintPlan(s);
  assert.equal(plan.state, 'strokes');
  assert.deepEqual(plan.fill, { state: 'solid', color: '#010203' });
  assert.equal(plan.strokes[0].color, '#040506');
  assert.equal(plan.strokes[0].width, (0.1 * 96) / 25.4);
  for (const patch of [
    { ...s, attributes: 1 },
    { ...s, borders: s.borders.map((b, i) => (i === 0 ? { ...b, kind: 8 } : b)) },
  ]) {
    const result = hwp5TableBorderPaintPlan(patch);
    assert.equal(result.state, 'unavailable');
    assert.deepEqual(result.fill, plan.fill);
  }
  for (const patch of [
    { ...s, alpha: { ...s.alpha, pattern: 1 } },
    { ...s, extra_bytes: 1 },
    { ...s, additional_bytes: 1 },
    { ...s, pattern: { ...s.pattern, kind: 6 } },
    { ...s, fill_known: false },
  ]) {
    const result = hwp5TableBorderPaintPlan(patch);
    assert.equal(result.state, 'unavailable');
    assert.equal(result.fill, undefined);
  }
  const transparent = hwp5TableBorderPaintPlan({
    ...s,
    pattern: { ...s.pattern, background: 0xffffffff },
  });
  assert.equal(transparent.fill, undefined);
  assert.deepEqual(s, before);
});
test('native table border indexing refuses mismatched and ambiguous cell/resource ownership', () => {
  const cell = {
    listNode: 3,
    layoutSource: { table_record_node: 2, list_node: 3, border_fill_id: 1 },
  };
  const content = {
    hwp5BorderFillSources: [style()],
    tables: [{ section: 0, tableNode: 2, cells: [cell] }],
  };
  assert.equal(hwp5TableBorderPaintIndex(content).cells.get('0:2:3').state, 'strokes');
  for (const change of [
    (c) => c.hwp5BorderFillSources.push(style()),
    (c) => c.tables[0].cells.push(structuredClone(cell)),
    (c) => (c.tables[0].cells[0].layoutSource.table_record_node = 9),
    (c) => (c.tables[0].cells[0].layoutSource.list_node = 9),
    (c) => (c.tables[0].cells[0].layoutSource.border_fill_id = 999),
  ]) {
    const changed = structuredClone(content);
    change(changed);
    assert.equal(hwp5TableBorderPaintIndex(changed).cells.get('0:2:3').state, 'unavailable');
  }
});
test('refresh removes previous resource data when the next document has no editor or ABI', () => {
  const content = { tables: [{}], hwp5BorderFillSources: [style()] };
  attachHwp5TableBorderSources({}, content);
  assert.equal(content.hwp5BorderFillSources, null);
  assert.equal(content.hwp5BorderFillSourceError, 'Hwp5BorderFillSourcesAbiUnavailable');
  attachHwp5TableBorderSources({ borderFillSources: () => [style()] }, content);
  assert.equal(content.hwp5BorderFillSourceError, null);
  assert.equal(content.hwp5BorderFillSources.length, 1);
  attachHwp5TableBorderSources(null, content);
  assert.equal(content.hwp5BorderFillSources, null);
  assert.equal(content.hwp5BorderFillSourceError, null);
});
