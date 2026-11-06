import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCellBorders,
  validateCellBordersMessage,
  encodeCellBorders,
} from '../js/cell-border-batch.mjs';
const value = {
  section: 1,
  tableNode: 2,
  listNode: 3,
  edges: 15,
  style: 'DOUBLE_SLIM',
  width: 500,
  color: 0x123456,
};
test('border batch owns values and encodes exact little-endian seven-scalar ABI', () => {
  const row = { ...value },
    source = [row],
    result = validateCellBorders(source);
  row.color = 0;
  assert.equal(result[0].color, 0x123456);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result[0]));
  const bytes = encodeCellBorders([value]),
    view = new DataView(bytes.buffer);
  assert.equal(bytes.length, 28);
  assert.deepEqual(
    Array.from({ length: 7 }, (_, i) => view.getUint32(i * 4, true)),
    [1, 2, 3, 15, 2, 500, 0x123456],
  );
  assert.equal(encodeCellBorders([]).length, 0);
});
test('batch rejects holes, extra metadata, duplicate owners and over-budget arrays', () => {
  const sparse = [];
  sparse.length = 1;
  for (const input of [
    null,
    {},
    sparse,
    [undefined],
    Object.assign([value], { extra: true }),
    [value, { ...value, tableNode: 9 }],
  ])
    assert.throws(() => validateCellBorders(input));
  const oversized = [];
  oversized.length = 4097;
  assert.throws(() => validateCellBorders(oversized), /LimitExceeded/);
  assert.deepEqual(validateCellBordersMessage({ kind: 'cell-borders', cells: [value] }), [value]);
  for (const input of [
    { kind: 'cell-borders', cells: [value], extra: 1 },
    Object.create({ kind: 'cell-borders', cells: [value] }),
    { kind: 'cell-border', cells: [value] },
  ])
    assert.throws(() => validateCellBordersMessage(input));
});
