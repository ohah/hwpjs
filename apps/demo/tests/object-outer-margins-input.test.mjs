import test from 'node:test';
import assert from 'node:assert/strict';
import { outerMarginDraft, outerMarginValues } from '../src/object-outer-margins-input.ts';
const original = { left: 1, right: 32767, top: 0, bottom: 12345 };
const clean = { left: false, right: false, top: false, bottom: false };
test('margin display includes zero without replacing rounded original source integers', () => {
  const labels = outerMarginDraft(original);
  assert.deepEqual(labels, { left: '0.004', right: '115.595', top: '0', bottom: '43.55' });
  assert.deepEqual(outerMarginValues(labels, clean, original), original);
  assert.deepEqual(
    outerMarginValues(labels, { left: true, right: true, top: true, bottom: true }, original),
    original,
  );
});
test('only edited direction converts exact mm and retains every other Native integer', () => {
  const draft = { ...outerMarginDraft(original), top: '2.54' };
  assert.deepEqual(outerMarginValues(draft, { ...clean, top: true }, original), {
    ...original,
    top: 720,
  });
});
test('explicit zero differs from absent draft and has no negative-zero coercion', () => {
  const draft = { ...outerMarginDraft(original), bottom: '0.00' };
  assert.deepEqual(outerMarginValues(draft, { ...clean, bottom: true }, original), {
    ...original,
    bottom: 0,
  });
  for (const text of [
    '',
    ' ',
    '-0',
    '-1',
    '+1',
    '1,2',
    '1mm',
    '1e2',
    'NaN',
    'Infinity',
    '1.0001',
    '115.60',
    '9'.repeat(41),
  ])
    assert.throws(
      () => outerMarginValues({ ...draft, bottom: text }, { ...clean, bottom: true }, original),
      undefined,
      text,
    );
});
test('all source directions must be present and within the Native first policy', () => {
  for (const value of [undefined, null, -0, -1, 32768, 0.5, NaN, Infinity, '0'])
    for (const direction of ['left', 'right', 'top', 'bottom'])
      assert.throws(() => outerMarginDraft({ ...original, [direction]: value }));
});
