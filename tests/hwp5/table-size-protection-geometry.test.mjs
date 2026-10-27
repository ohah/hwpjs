import assert from 'node:assert/strict';
import test from 'node:test';
import { hwp5TableGeometry } from '../../web/preview/hwp5-table-geometry.mjs';

const source = (object_flags) => ({
  table_node: 0,
  table_record_node: 1,
  object_flags,
  width: 100,
  height: 200,
  instance_id: 1,
  object_extra_bytes: 0,
  table_flags: 0,
  table_extra_bytes: 0,
  offset_y: 0,
  offset_x: 0,
  z_order: 0,
  prevent_page_break: 0,
  rows: 1,
  columns: 1,
  border_fill_id: 0,
  cell_spacing: 0,
  outer_margins: [0, 0, 0, 0],
  inner_margins: [0, 0, 0, 0],
  description_bytes: null,
  zone_count: 0,
});
test('table geometry preserves paragraph-relative size protection for all valid references', () => {
  for (const vertical of [0, 1, 2])
    for (const bit of [false, true]) {
      const row = source((vertical << 3) | (bit ? 1 << 20 : 0));
      const before = structuredClone(row);
      const value = hwp5TableGeometry(row);
      assert.equal(Object.hasOwn(value, 'size_protected'), true);
      assert.equal(value.size_protected, vertical === 2 && bit);
      assert.deepEqual(row, before);
    }
});
test('table size protection preserves observed lock and all other placement values', () => {
  const row = source((2 << 3) | (1 << 20) | 0x40000000);
  const value = hwp5TableGeometry(row);
  assert.equal(value.size_protected, true);
  assert.equal(value.locked, true);
  assert.equal(value.vertical_relative, 2);
  assert.equal(value.geometry.width, 100);
});
test('invalid source and enum never become a false size protection DTO', () => {
  for (const row of [source(undefined), source(null), source(3 << 3)])
    assert.throws(() => hwp5TableGeometry(row));
});
test('unknown object bit and extension rejection remain fail closed', () => {
  for (const bit of [2, 0x80000000])
    assert.throws(() => hwp5TableGeometry(source(bit)), /UnsupportedHwp5TableExtension/);
  const row = { ...source(1 << 20), object_extra_bytes: 1 };
  assert.throws(() => hwp5TableGeometry(row), /UnsupportedHwp5TableExtension/);
});
