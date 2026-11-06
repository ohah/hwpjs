import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCellDiagonals, encodeCellDiagonals } from '../js/cell-diagonal-command.mjs';
import { validateCellStyles, validateCellStylesMessage } from '../js/cell-style-command.mjs';
import {
  hwp5DiagonalDirections,
  hwpxDiagonalDirections,
} from '../js/table-diagonal-directions.mjs';
const owner = { section: 0, tableNode: 20, listNode: 21 };
const xml = {
  slash: 'NONE',
  back_slash: 'NONE',
  center_line: 'NONE',
  slash_crooked: '0',
  slash_is_counter: '0',
  back_slash_crooked: '0',
  back_slash_is_counter: '0',
};
test('official simple geometry maps literal rising/falling endpoints domains, not UI ordinal guesses', () => {
  for (const [raw, expected] of [
    [0, 'none'],
    [8, 'rising'],
    [64, 'falling'],
    [72, 'cross'],
  ]) {
    assert.equal(hwp5DiagonalDirections(raw), expected);
    assert.equal(
      hwp5DiagonalDirections(raw | 3),
      expected,
      'unrelated effects do not change source geometry',
    );
  }
  for (const raw of [-1, 0x10000, 4, 12, 0x100, 0x800, 0x2000, 0x4000, null, '8'])
    assert.equal(hwp5DiagonalDirections(raw), null);
  assert.equal(hwpxDiagonalDirections(xml), 'none');
  assert.equal(hwpxDiagonalDirections({ ...xml, slash: 'CENTER' }), 'rising');
  assert.equal(hwpxDiagonalDirections({ ...xml, back_slash: 'CENTER' }), 'falling');
  assert.equal(hwpxDiagonalDirections({ ...xml, slash: 'CENTER', back_slash: 'CENTER' }), 'cross');
});
test('missing, curved, rotated and center geometry is never defaulted to none', () => {
  for (const key of [
    'slash_crooked',
    'slash_is_counter',
    'back_slash_crooked',
    'back_slash_is_counter',
  ]) {
    const missing = { ...xml };
    delete missing[key];
    assert.equal(hwpxDiagonalDirections(missing), null);
    for (const value of ['1', 'false', '', null, 0])
      assert.equal(hwpxDiagonalDirections({ ...xml, [key]: value }), null);
  }
  assert.equal(hwpxDiagonalDirections({ ...xml, center_line: 'BOTH' }), null);
  assert.equal(hwpxDiagonalDirections({ ...xml, slash: 'CENTER_BELOW' }), null);
});
test('all fifteen presence masks preserve explicit no directions, no stroke and black separately from omitted', () => {
  for (let mask = 1; mask < 16; mask++) {
    const row = {
      ...owner,
      ...(mask & 1 ? { directions: 'none' } : {}),
      ...(mask & 2 ? { style: 'NONE' } : {}),
      ...(mask & 4 ? { width: 10 } : {}),
      ...(mask & 8 ? { color: 0 } : {}),
    };
    const normalized = validateCellDiagonals([row])[0],
      bytes = encodeCellDiagonals([row]),
      v = new DataView(bytes.buffer);
    assert.equal(bytes.length, 48);
    assert.deepEqual(
      Array.from({ length: 12 }, (_, i) => v.getUint32(i * 4, true)),
      [0, 20, 21, mask, 0, 0, mask & 4 ? 10 : 0, 0, 0, 0, 0, 0],
    );
    for (const [key, bit] of [
      ['directions', 1],
      ['style', 2],
      ['width', 4],
      ['color', 8],
    ])
      assert.equal(Object.hasOwn(normalized, key), Boolean(mask & bit));
    assert.ok(Object.isFrozen(normalized));
  }
});
test('four geometric codes and shared stroke codec occupy independent exact wire words', () => {
  const directions = ['none', 'rising', 'falling', 'cross'];
  for (const [index, direction] of directions.entries()) {
    const b = encodeCellDiagonals([
        { ...owner, directions: direction, style: 'DOUBLE_SLIM', width: 50, color: 0x123456 },
      ]),
      v = new DataView(b.buffer);
    assert.deepEqual(
      Array.from({ length: 12 }, (_, i) => v.getUint32(i * 4, true)),
      [0, 20, 21, 15, index, 2, 50, 0x123456, 0, 0, 0, 0],
    );
  }
});
test('sparse diagonal input is copied and frozen before caller mutation', () => {
  const row = { ...owner, color: 0 },
    input = [row],
    output = validateCellDiagonals(input);
  row.color = 0xffffff;
  input.length = 0;
  assert.deepEqual(output, [{ ...owner, color: 0 }]);
  assert.ok(Object.isFrozen(output) && Object.isFrozen(output[0]));
});
test('invalid diagonal scalars, unknown keys and empty patches never reach ABI', () => {
  for (const row of [
    { ...owner },
    { ...owner, directions: 0 },
    { ...owner, directions: '' },
    { ...owner, directions: 'slash' },
    { ...owner, style: 'DASH' },
    { ...owner, width: 0 },
    { ...owner, width: 11 },
    { ...owner, color: -1 },
    { ...owner, color: 0x1000000 },
    { ...owner, color: '0' },
    { ...owner, color: undefined },
    { ...owner, edges: 16, color: 0 },
    Object.assign(Object.create(owner), { color: 0 }),
  ])
    assert.throws(() => validateCellDiagonals([row]));
});
test('array holes, extras, duplicate section-list owners and over-budget rows are rejected', () => {
  const hole = [];
  hole.length = 1;
  const tooMany = [];
  tooMany.length = 4097;
  assert.throws(() => validateCellDiagonals(hole));
  assert.throws(() => validateCellDiagonals(tooMany), /LimitExceeded/);
  assert.throws(() =>
    validateCellDiagonals(Object.assign([{ ...owner, color: 0 }], { extra: true })),
  );
  assert.throws(
    () =>
      validateCellDiagonals([
        { ...owner, color: 0 },
        { ...owner, tableNode: 99, directions: 'none' },
      ]),
    /DuplicateCellDiagonalEdit/,
  );
});
test('three style arrays share one coherent owner without changing legacy two-array envelope', () => {
  const borders = [{ ...owner, edges: 1, color: 0 }],
    fills = [{ ...owner, fill: { kind: 'none' } }],
    diagonals = [{ ...owner, directions: 'none' }];
  const v = validateCellStylesMessage({ kind: 'cell-styles', borders, fills, diagonals });
  assert.ok(Object.isFrozen(v.diagonals));
  assert.deepEqual(v.diagonals, diagonals);
  assert.deepEqual(validateCellStyles({ borders: [], fills: [] }), { borders: [], fills: [] });
  assert.throws(
    () =>
      validateCellStyles({ borders, fills, diagonals: [{ ...owner, tableNode: 99, color: 0 }] }),
    /AmbiguousCellStyleOwner/,
  );
});
test('combined union budget counts each owner once across all three arrays', () => {
  const diagonals = Array.from({ length: 4096 }, (_, listNode) => ({
    ...owner,
    listNode,
    directions: 'none',
  }));
  const fills = diagonals.map(({ section, tableNode, listNode }) => ({
    section,
    tableNode,
    listNode,
    fill: { kind: 'none' },
  }));
  assert.equal(validateCellStyles({ borders: [], fills, diagonals }).diagonals.length, 4096);
  assert.throws(
    () =>
      validateCellStyles({
        borders: [{ ...owner, listNode: 4096, edges: 1, color: 0 }],
        fills,
        diagonals,
      }),
    /LimitExceeded/,
  );
});
test('optional versioned diagonal property is strict rather than an ignored side channel', () => {
  for (const extra of [
    { diagonals: null },
    { diagonals: undefined },
    { diagonal: [] },
    { unknown: [] },
  ])
    assert.throws(() => validateCellStyles({ borders: [], fills: [], ...extra }));
  assert.throws(() =>
    validateCellStylesMessage({
      kind: 'cell-styles',
      borders: [],
      fills: [],
      diagonals: [],
      extra: true,
    }),
  );
  assert.deepEqual(validateCellStyles({ borders: [], fills: [], diagonals: [] }), {
    borders: [],
    fills: [],
    diagonals: [],
  });
});
