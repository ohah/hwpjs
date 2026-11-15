import test from 'node:test';
import assert from 'node:assert/strict';
import {
  objectGeometryDraft,
  objectGeometryPatch,
  objectOffsetUnits,
  objectOffsetMillimeters,
} from '../src/object-geometry-input.ts';
const source = { width: 12347, height: 23459, horizontalOffset: -1537, verticalOffset: 2841 };
test('untouched rounded fields produce no mutation intent and preserve every source unit', () => {
  const draft = objectGeometryDraft(source);
  assert.deepEqual(objectGeometryPatch(draft, source), {});
  assert.equal(source.width, 12347);
  assert.equal(source.horizontalOffset, -1537);
});
test('one edited size emits only that native dimension', () => {
  const draft = objectGeometryDraft(source);
  const patch = objectGeometryPatch(
    { ...draft, width: '50', dirty: { ...draft.dirty, width: true } },
    source,
  );
  assert.deepEqual(patch, { width: 14173 });
});
test('signed offsets reuse the picture units conversion while allowing zero', () => {
  assert.equal(objectOffsetUnits('-25.4'), -7200);
  assert.equal(objectOffsetUnits('25.4'), 7200);
  assert.equal(objectOffsetUnits('0'), 0);
  assert.equal(objectOffsetUnits('-0.00'), 0);
  assert.equal(Object.is(objectOffsetUnits('-0.00'), -0), false);
  assert.equal(objectOffsetMillimeters(-7200), '-25.4');
});
test('dirty zero position is a real request, not a missing value', () => {
  const draft = objectGeometryDraft(source);
  assert.deepEqual(
    objectGeometryPatch(
      { ...draft, horizontalOffset: '0', dirty: { ...draft.dirty, horizontalOffset: true } },
      source,
    ),
    { horizontalOffset: 0 },
  );
});
test('dirty field equal to exact original remains a no-op', () => {
  const original = { width: 7200, height: 7200, horizontalOffset: -7200, verticalOffset: 0 };
  const draft = objectGeometryDraft(original);
  assert.deepEqual(
    objectGeometryPatch(
      {
        ...draft,
        dirty: { width: true, height: true, horizontalOffset: true, verticalOffset: true },
      },
      original,
    ),
    {},
  );
});
test('invalid and out-of-range offsets never become geometry intents', () => {
  for (const value of ['', 'NaN', 'Infinity', '1e3', '1.234', '--1', '9000000', '-9000000'])
    assert.throws(() => objectOffsetUnits(value), undefined, value);
});
test('invalid native dimensions or offsets cannot seed an editable draft', () => {
  for (const change of [
    { width: 0 },
    { height: -1 },
    { width: 0x100000000 },
    { verticalOffset: 0x80000000 },
    { horizontalOffset: -0x80000001 },
  ])
    assert.throws(() => objectGeometryDraft({ ...source, ...change }));
});

test('dirty unchanged rounded offset presentation retains the exact positive and negative Native units', () => {
  const frame = { width: 12345, height: 9876, horizontalOffset: 1, verticalOffset: -1 };
  const draft = objectGeometryDraft(frame);
  assert.deepEqual(
    objectGeometryPatch(
      { ...draft, dirty: { ...draft.dirty, horizontalOffset: true, verticalOffset: true } },
      frame,
    ),
    {},
  );
});
test('an actual visible offset change remains a sparse signed Native edit', () => {
  const frame = { width: 12345, height: 9876, horizontalOffset: 1, verticalOffset: -1 };
  const draft = objectGeometryDraft(frame);
  assert.deepEqual(
    objectGeometryPatch(
      {
        ...draft,
        horizontalOffset: '0.01',
        verticalOffset: '-0.01',
        dirty: { ...draft.dirty, horizontalOffset: true, verticalOffset: true },
      },
      frame,
    ),
    { horizontalOffset: 3, verticalOffset: -3 },
  );
});
