import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCellFill, validateCellFills, encodeCellFills } from '../js/cell-fill-command.mjs';
import { validateCellStyles, validateCellStylesMessage } from '../js/cell-style-command.mjs';
const owner = { section: 1, tableNode: 2, listNode: 3 };
const gradient = {
  kind: 'linear',
  colors: [0x123456, 0xabcdef],
  angle: 359,
  centerX: 0,
  centerY: 100,
  step: 25,
  stepCenter: 75,
};

test('fill wire encodes all four variants and reserved words exactly', () => {
  const variants = [
    { kind: 'none' },
    { kind: 'solid', color: 0 },
    { kind: 'hatch', face: 0x123456, hatch: 0xffffff, style: 'CROSS_DIAGONAL' },
    gradient,
  ];
  const bytes = encodeCellFills(variants.map((fill, i) => ({ ...owner, listNode: i + 3, fill })));
  assert.equal(bytes.length, 192);
  const words = new DataView(bytes.buffer),
    row = (index) =>
      Array.from({ length: 12 }, (_, i) => words.getUint32(index * 48 + i * 4, true));
  assert.deepEqual(row(0), [1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(row(1), [1, 2, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(row(2), [1, 2, 5, 2, 0x123456, 0xffffff, 5, 0, 0, 0, 0, 0]);
  assert.deepEqual(row(3), [1, 2, 6, 3, 0x123456, 0xabcdef, 359, 0, 100, 25, 75, 0]);
});
test('fill commands own nested colors and preserve explicit black and no fill', () => {
  const input = { ...owner, fill: { ...gradient, colors: [...gradient.colors] } },
    values = validateCellFills([input]);
  input.fill.colors[0] = 9;
  assert.equal(values[0].fill.colors[0], 0x123456);
  assert.ok(
    Object.isFrozen(values) && Object.isFrozen(values[0]) && Object.isFrozen(values[0].fill.colors),
  );
  assert.deepEqual(validateCellFill({ kind: 'solid', color: 0 }), { kind: 'solid', color: 0 });
  assert.deepEqual(validateCellFill({ kind: 'none' }), { kind: 'none' });
});
test('invalid shape, colors, unobserved coercions and gradient bounds are refused', () => {
  for (const value of [
    null,
    [],
    { kind: 'none', color: 0 },
    { kind: 'image' },
    { kind: 'solid', color: '0' },
    { kind: 'solid', color: -1 },
    { kind: 'solid', color: 0x1000000 },
    { ...gradient, angle: 360 },
    { ...gradient, centerX: 101 },
    { ...gradient, step: NaN },
    { ...gradient, colors: [0] },
    { ...gradient, colors: Object.assign([0, 1], { extra: 1 }) },
    { kind: 'hatch', face: 0, hatch: 0, style: 'SOLID' },
  ])
    assert.throws(() => validateCellFill(value));
  const inherited = Object.create({ kind: 'solid', color: 0 });
  assert.throws(() => validateCellFill(inherited));
});
test('sparse, duplicate owner and over-budget fill batches never enter the ABI', () => {
  const sparse = [];
  sparse.length = 1;
  const oversized = [];
  oversized.length = 4097;
  assert.throws(() => validateCellFills(sparse));
  assert.throws(() => validateCellFills(oversized), /LimitExceeded/);
  const row = { ...owner, fill: { kind: 'none' } };
  assert.throws(() => validateCellFills([row, { ...row, tableNode: 7 }]), /DuplicateCellFillEdit/);
  assert.throws(() => validateCellFills(Object.assign([row], { x: 1 })));
  assert.deepEqual(validateCellFills([]), []);
});
test('style transaction normalizes border and fill arrays without weakening legacy messages', () => {
  const input = { borders: [], fills: [{ ...owner, fill: { kind: 'none' } }] },
    output = validateCellStyles(input);
  assert.ok(Object.isFrozen(output) && Object.isFrozen(output.fills));
  assert.deepEqual(validateCellStylesMessage({ kind: 'cell-styles', ...input }), {
    kind: 'cell-styles',
    ...output,
  });
  assert.throws(() => validateCellStyles({ ...input, background: null }));
  assert.throws(() => validateCellStylesMessage({ kind: 'cell-appearance', ...input }));
  assert.throws(() => validateCellStylesMessage({ kind: 'cell-styles', ...input, extra: true }));
});

test('sparse border wire distinguishes omitted fields from explicit NONE and black', async () => {
  const { encodeCellBorderPatches, validateCellBorderPatches } =
    await import('../js/cell-border-patch-command.mjs');
  for (let mask = 1; mask <= 7; mask++) {
    const input = {
      ...owner,
      edges: 15,
      ...(mask & 1 ? { style: 'NONE' } : {}),
      ...(mask & 2 ? { width: 10 } : {}),
      ...(mask & 4 ? { color: 0 } : {}),
    };
    const normalized = validateCellBorderPatches([input])[0];
    assert.equal(Object.hasOwn(normalized, 'style'), Boolean(mask & 1));
    assert.equal(Object.hasOwn(normalized, 'width'), Boolean(mask & 2));
    assert.equal(Object.hasOwn(normalized, 'color'), Boolean(mask & 4));
    const bytes = encodeCellBorderPatches([input]),
      view = new DataView(bytes.buffer);
    assert.equal(bytes.length, 32);
    assert.deepEqual(
      Array.from({ length: 8 }, (_, i) => view.getUint32(i * 4, true)),
      [1, 2, 3, 15, mask, 0, mask & 2 ? 10 : 0, 0],
    );
    assert.ok(Object.isFrozen(normalized));
  }
  assert.throws(() => validateCellBorderPatches([{ ...owner, edges: 15 }]));
  assert.throws(() => validateCellBorderPatches([{ ...owner, edges: 15, color: undefined }]));
});

test('combined budget counts coherent cell owners once and refuses conflicting tables', () => {
  const borders = Array.from({ length: 4096 }, (_, listNode) => ({
    ...owner,
    listNode,
    edges: 1,
    color: 0,
  }));
  const fills = borders.map(({ section, tableNode, listNode }) => ({
    section,
    tableNode,
    listNode,
    fill: { kind: 'none' },
  }));
  assert.equal(validateCellStyles({ borders, fills }).fills.length, 4096);
  assert.throws(
    () =>
      validateCellStyles({
        borders,
        fills: [{ ...owner, listNode: 4096, fill: { kind: 'none' } }],
      }),
    /LimitExceeded/,
  );
  assert.throws(
    () => validateCellStyles({ borders: [borders[0]], fills: [{ ...fills[0], tableNode: 99 }] }),
    /AmbiguousCellStyleOwner/,
  );
});
