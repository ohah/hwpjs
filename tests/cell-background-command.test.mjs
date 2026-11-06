import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCellBackground,
  validateCellBackgroundMessage,
} from '../js/cell-background-command.mjs';
import { surfaceOperation } from '../packages/core/src/commands/surface-protocol.ts';

const original = { section: 0, tableNode: 10, listNode: 20, color: 0x123456 };

test('cell background validates scalar ownership without altering RGB byte order', () => {
  for (const color of [0, 0xffffff, 0x123456, 0xff0000, 0x00ff00, 0x0000ff]) {
    const input = { ...original, color };
    const output = validateCellBackground(input);
    assert.deepEqual(output, input);
    assert.notEqual(output, input);
    assert(Object.isFrozen(output));
    input.color = 0;
    assert.equal(output.color, color);
  }
});

test('cell background refuses invalid coordinates, alpha and nonnumeric colors', () => {
  for (const name of ['section', 'tableNode', 'listNode', 'color']) {
    const maximum = name === 'color' ? 0xffffff : 0xffffffff;
    assert.equal(validateCellBackground({ ...original, [name]: maximum })[name], maximum);
    for (const value of [-1, maximum + 1, 1.5, NaN, Infinity, -Infinity, '1', null, undefined, 1n])
      assert.throws(
        () => validateCellBackground({ ...original, [name]: value }),
        /InvalidCellBackground/,
      );
  }
});

test('cell background requires exact own fields and sanitizes mutable inputs', () => {
  for (const input of [null, [], {}, Object.create(original), { ...original, alpha: 0 }])
    assert.throws(() => validateCellBackground(input), /InvalidCellBackground/);
  const symbol = { ...original, [Symbol('hidden')]: true };
  assert.throws(() => validateCellBackground(symbol), /InvalidCellBackground/);
  const hidden = Object.defineProperty({ ...original }, 'extra', { value: true });
  assert.throws(() => validateCellBackground(hidden), /InvalidCellBackground/);
  const emptyPrototype = Object.assign(Object.create(null), original);
  assert.deepEqual(validateCellBackground(emptyPrototype), original);
  for (const name of Object.keys(original)) {
    const missing = { ...original };
    delete missing[name];
    assert.throws(() => validateCellBackground(missing), /InvalidCellBackground/);
  }
});

test('cell background reads each scalar once before dispatch', () => {
  const reads = new Map();
  const input = Object.fromEntries(Object.entries(original));
  for (const name of Object.keys(original))
    Object.defineProperty(input, name, {
      enumerable: true,
      get() {
        reads.set(name, (reads.get(name) ?? 0) + 1);
        return original[name];
      },
    });
  assert.deepEqual(validateCellBackground(input), original);
  assert.deepEqual([...reads.values()], [1, 1, 1, 1]);
});

test('cell background uses the existing mutation and history admission path', () => {
  assert.equal(surfaceOperation('cell-background'), 'mutation');
  assert.equal(surfaceOperation('query-cell-background'), undefined);
});

test('Worker and SDK reject the same extra payload fields instead of silently ignoring them', () => {
  assert.deepEqual(
    validateCellBackgroundMessage({ kind: 'cell-background', ...original }),
    original,
  );
  for (const payload of [
    { ...original, colorRGB24: 0 },
    { ...original, alpha: 0 },
  ]) {
    assert.throws(() => validateCellBackground(payload), /InvalidCellBackground/);
    assert.throws(
      () => validateCellBackgroundMessage({ kind: 'cell-background', ...payload }),
      /InvalidCellBackground/,
    );
  }
  assert.throws(
    () => validateCellBackgroundMessage({ kind: 'cell-size', ...original }),
    /InvalidCellBackground/,
  );
});
