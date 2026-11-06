import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateCellBorder,
  validateCellBorderMessage,
  cellBorderStyleCode,
} from '../js/cell-border-command.mjs';
import { validateBorderPatch } from '../packages/core/src/commands/formatting-resource-intent.ts';
import { surfaceOperation } from '../packages/core/src/commands/surface-protocol.ts';

const original = {
  section: 0,
  tableNode: 20,
  listNode: 21,
  edges: 1,
  style: 'SOLID',
  width: 20,
  color: 0,
};

test('cell border validates all masks, styles, widths and explicit black without source byte swapping', () => {
  const widths = [10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 100, 150, 200, 300, 400, 500];
  for (let edges = 1; edges <= 15; edges++)
    for (const style of ['NONE', 'SOLID', 'DOUBLE_SLIM'])
      for (const width of widths)
        for (const color of [0, 0x123456, 0xffffff]) {
          const input = { ...original, edges, style, width, color };
          const value = validateCellBorder(input);
          assert.deepEqual(value, input);
          assert.notEqual(value, input);
          assert.ok(Object.isFrozen(value));
          assert.equal(
            validateBorderPatch({ left: { style, widthHundredthMm: width, color } }),
            true,
          );
        }
  assert.equal(cellBorderStyleCode('NONE'), 0);
  assert.equal(cellBorderStyleCode('SOLID'), 1);
  assert.equal(cellBorderStyleCode('DOUBLE_SLIM'), 2);
  assert.throws(() => cellBorderStyleCode(8), /UnsupportedCellBorderStyle/);
});

test('cell border refuses partial, inherited, aliased, hidden and symbol payloads before dispatch', () => {
  for (const input of [
    null,
    [],
    {},
    Object.create(original),
    { ...original, alpha: 0 },
    { ...original, widthHundredthMm: 20 },
  ])
    assert.throws(() => validateCellBorder(input));
  for (const name of Object.keys(original)) {
    const input = { ...original };
    delete input[name];
    assert.throws(() => validateCellBorder(input));
  }
  assert.throws(() => validateCellBorder({ ...original, [Symbol('extra')]: 1 }));
  assert.throws(() =>
    validateCellBorder(Object.defineProperty({ ...original }, 'extra', { value: 1 })),
  );
  assert.deepEqual(validateCellBorder(Object.assign(Object.create(null), original)), original);
});

test('cell border refuses unknown style and width values rather than rounding or truncating', () => {
  for (const style of ['DASH', 'solid', '', 0, 1, 8, null, undefined])
    assert.throws(() => validateCellBorder({ ...original, style }), /UnsupportedCellBorderStyle/);
  for (const width of [0, 11, 19.999, 20.1, 0.2, '20', 0x10014, NaN, Infinity, null, undefined])
    assert.throws(() => validateCellBorder({ ...original, width }), /UnsupportedBorderWidth/);
  for (const name of ['section', 'tableNode', 'listNode', 'edges', 'color']) {
    const max = name === 'edges' ? 15 : name === 'color' ? 0xffffff : 0xffffffff;
    assert.equal(validateCellBorder({ ...original, [name]: max })[name], max);
    for (const value of [-1, max + 1, 1.5, NaN, Infinity, '1', null, undefined, 1n])
      assert.throws(() => validateCellBorder({ ...original, [name]: value }));
  }
  assert.throws(() => validateCellBorder({ ...original, edges: 0 }));
});

test('cell border snapshots getters once and owns later caller mutation', () => {
  const reads = new Map();
  const input = {};
  for (const name of Object.keys(original))
    Object.defineProperty(input, name, {
      enumerable: true,
      get() {
        reads.set(name, (reads.get(name) ?? 0) + 1);
        return original[name];
      },
    });
  assert.deepEqual(validateCellBorder(input), original);
  assert.deepEqual([...reads.values()], [1, 1, 1, 1, 1, 1, 1]);
  const mutable = { ...original };
  const captured = validateCellBorder(mutable);
  mutable.color = 0xffffff;
  assert.equal(captured.color, 0);
});

test('Worker and SDK use identical admission and the existing mutation fence', () => {
  assert.equal(surfaceOperation('cell-border'), 'mutation');
  assert.equal(surfaceOperation('query-cell-border'), undefined);
  assert.deepEqual(validateCellBorderMessage({ kind: 'cell-border', ...original }), original);
  for (const input of [
    { ...original, alpha: 0 },
    { ...original, colorRGB24: 0 },
    { ...original, inner: true },
  ]) {
    assert.throws(() => validateCellBorder(input));
    assert.throws(() => validateCellBorderMessage({ ...input, kind: 'cell-border' }));
  }
  assert.throws(() => validateCellBorderMessage({ ...original, kind: 'cell-background' }));
});

test('shared wire widths match the Native BorderFill domain, including the upper range', () => {
  const source = readFileSync(
    new URL('../src/model/border_fill_patch.zig', import.meta.url),
    'utf8',
  );
  const widths = source
    .match(/pub const widths = \[_\]u16\{([^}]+)\}/)[1]
    .split(',')
    .map((x) => Number(x.trim()))
    .filter(Boolean);
  assert.deepEqual(widths, [10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 100, 150, 200, 300, 400, 500]);
  for (const width of widths) assert.equal(validateCellBorder({ ...original, width }).width, width);
});
