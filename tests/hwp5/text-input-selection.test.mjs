import test from 'node:test';
import assert from 'node:assert/strict';
import { textChange } from '../../web/preview/text-input.mjs';

test("collapsed repeated-text deletion retains the browser's caret and direction", () => {
  for (const [before, after, caret, inputType, first, last] of [
    ['aaa', 'aa', 1, 'deleteContentBackward', 0, 1],
    ['aaa', 'aa', 0, 'deleteContentForward', 0, 1],
    ['😀😀😀', '😀😀', 2, 'deleteContentBackward', 0, 2],
  ]) {
    assert.deepEqual(textChange(before, after, { startUnit: caret, endUnit: caret, inputType }), {
      startUnit: first,
      endUnit: last,
      text: '',
    });
  }
});

test('verified input selections retain repeated text positions instead of shifting format ownership', () => {
  for (const [before, after, startUnit, endUnit, text] of [
    ['화', '화면양식😀화', 0, 0, '화면양식😀'],
    ['aaa', 'aa', 0, 1, ''],
    ['😀😀', '😀😀😀', 0, 0, '😀'],
    ['aba', 'abaaba', 0, 3, 'abaaba'],
  ]) {
    assert.deepEqual(textChange(before, after, { startUnit, endUnit }), {
      startUnit,
      endUnit,
      text,
    });
    assert.equal(before.slice(0, startUnit) + text + before.slice(endUnit), after);
  }
  assert.equal(textChange('same', 'same', { startUnit: 0, endUnit: 4 }), null);
});

test('stale invalid or surrogate-splitting selection hints fall back to the existing diff', () => {
  for (const selection of [
    null,
    {},
    { startUnit: '0', endUnit: 0 },
    { startUnit: -1, endUnit: 0 },
    { startUnit: 2, endUnit: 1 },
    { startUnit: 0, endUnit: 99 },
    { startUnit: 1, endUnit: 1 },
  ]) {
    assert.deepEqual(textChange('😀😀', '😀😀😀', selection), textChange('😀😀', '😀😀😀'));
  }
  assert.deepEqual(
    textChange('abc', 'xabc', { startUnit: 2, endUnit: 2 }),
    textChange('abc', 'xabc'),
  );
  for (const [caret, inputType] of [
    [0, 'deleteContentBackward'],
    [3, 'deleteContentForward'],
    [1, 'deleteWordBackward'],
  ]) {
    assert.deepEqual(
      textChange('aaa', 'aa', { startUnit: caret, endUnit: caret, inputType }),
      textChange('aaa', 'aa'),
    );
  }
  assert.deepEqual(
    textChange('aba', 'ba', { startUnit: 2, endUnit: 2, inputType: 'deleteContentBackward' }),
    textChange('aba', 'ba'),
  );
});
