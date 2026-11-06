import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCellAppearance,
  validateCellAppearanceMessage,
} from '../js/cell-appearance-command.mjs';
const border = {
  section: 0,
  tableNode: 1,
  listNode: 2,
  edges: 15,
  style: 'SOLID',
  width: 20,
  color: 0,
};
const background = { section: 0, tableNode: 1, listNode: 2, color: 0x123456 };
test('appearance owns border and background as one immutable command, preserving explicit black', () => {
  const b = { ...background },
    row = { ...border };
  const value = validateCellAppearance({ cells: [row], background: b });
  row.color = 0xffffff;
  b.color = 0;
  assert.equal(value.cells[0].color, 0);
  assert.equal(value.background.color, 0x123456);
  assert.ok(Object.isFrozen(value) && Object.isFrozen(value.background));
  assert.deepEqual(validateCellAppearance({ cells: [], background: null }), {
    cells: [],
    background: null,
  });
  assert.deepEqual(
    validateCellAppearanceMessage({ kind: 'cell-appearance', cells: [border], background }),
    { kind: 'cell-appearance', cells: [border], background },
  );
});
test('appearance rejects partial or aliased payloads before any Native mutation', () => {
  for (const v of [
    { cells: [] },
    { background },
    Object.create({ cells: [], background: null }),
    { cells: [], background: undefined },
    { cells: [border], background: { ...background, alpha: 0 } },
    { cells: [], background: null, extra: 0 },
  ])
    assert.throws(() => validateCellAppearance(v));
  assert.throws(() =>
    validateCellAppearanceMessage({ kind: 'cell-borders', cells: [], background: null }),
  );
});
