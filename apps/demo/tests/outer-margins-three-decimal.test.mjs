import test from 'node:test';
import assert from 'node:assert/strict';
import {
  outerMarginUnits,
  outerMarginMillimeters,
  outerMarginDraft,
  outerMarginValues,
} from '../src/object-outer-margins-input.ts';
import { objectOffsetUnits, objectOffsetMillimeters } from '../src/object-geometry-input.ts';
const zero = { left: 0, right: 0, top: 0, bottom: 0 },
  clean = { left: false, right: false, top: false, bottom: false };
test('requested three-decimal mm inputs reach exact Native 750 and 1500', () => {
  assert.equal(outerMarginUnits('2.646'), 750);
  assert.equal(outerMarginUnits('5.292'), 1500);
  assert.deepEqual(
    outerMarginValues(
      { left: '2.646', right: '5.292', top: '0', bottom: '0' },
      { ...clean, left: true, right: true },
      zero,
    ),
    { ...zero, left: 750, right: 1500 },
  );
});
test('existing two-decimal inputs and exact old labels stay unchanged', () => {
  for (const [text, units] of [
    ['0', 0],
    ['1', 283],
    ['2.54', 720],
    ['2.65', 751],
    ['5.29', 1500],
    ['1.00', 283],
    ['1.0000', 283],
    ['.50', 142],
  ])
    assert.equal(outerMarginUnits(text), units);
  for (const units of [0, 283, 720, 751, 1500, 12345, -283, -1500])
    assert.equal(outerMarginMillimeters(units), objectOffsetMillimeters(units));
  assert.equal(outerMarginMillimeters(750), '2.646');
  assert.equal(outerMarginMillimeters(-1), '-0.004');
});
test('all 65536 signed i16 source values round-trip through the minimal exact displayed mm', () => {
  let count = 0;
  for (let units = -32768; units <= 32767; units++) {
    const label = outerMarginMillimeters(units);
    assert.equal(outerMarginUnits(label), units, String(units));
    assert.match(label, /^-?\d+(?:\.\d{1,3})?$/);
    count++;
  }
  assert.equal(count, 65536);
});
test('every nonnegative Native margin unit is reachable from an explicit fresh UI draft', () => {
  for (let units = 0; units <= 32767; units++) {
    const result = outerMarginValues(
      { ...outerMarginDraft(zero), left: outerMarginMillimeters(units) },
      { ...clean, left: true },
      zero,
    );
    assert.equal(result.left, units);
    assert.equal(result.right, 0);
  }
});
test('untouched originals retain source integers and negative writes remain forbidden', () => {
  const original = { left: 750, right: 1500, top: 1, bottom: 32767 };
  const labels = outerMarginDraft(original);
  assert.deepEqual(outerMarginValues(labels, clean, original), original);
  assert.deepEqual(
    outerMarginValues({ ...labels, left: '2.6460' }, { ...clean, left: true }, original),
    original,
  );
  const negative = { ...original, left: -1 };
  assert.equal(outerMarginDraft(negative, 'hwp5').left, '-0.004');
  assert.throws(() =>
    outerMarginValues(outerMarginDraft(negative, 'hwp5'), clean, negative, 'hwp5'),
  );
  assert.throws(() =>
    outerMarginValues({ ...labels, left: '-0' }, { ...clean, left: true }, original),
  );
  assert.throws(() =>
    outerMarginValues({ ...labels, left: '-0.004' }, { ...clean, left: true }, original),
  );
});
test('overprecision, malformed, non-finite, signed overflow and negative zero source words are refused', () => {
  for (const text of [
    '',
    ' ',
    '+1',
    '1e2',
    '1,2',
    '1mm',
    'NaN',
    'Infinity',
    '0.0001',
    '2.6461',
    '115.60',
    '-115.60',
    '9'.repeat(41),
  ])
    assert.throws(() => outerMarginUnits(text), undefined, text);
  for (const value of [-0, -32769, 32768, NaN, Infinity, undefined])
    assert.throws(() => outerMarginMillimeters(value));
});
test('geometry conversion remains two-decimal and unchanged', () => {
  assert.equal(objectOffsetMillimeters(750), '2.65');
  assert.throws(() => objectOffsetUnits('2.646'));
  assert.equal(objectOffsetUnits('2.65'), 751);
});

test('explicit HX and H5 aliases keep identical positive precision and HX still rejects signed observations', () => {
  for (const format of ['hwpx', 'hwp5']) {
    const original = { left: 750, right: 1500, top: 1, bottom: 32767 };
    const labels = outerMarginDraft(original, format);
    assert.equal(labels.left, '2.646');
    assert.equal(labels.right, '5.29');
    assert.equal(labels.top, '0.004');
    assert.equal(labels.bottom, '115.595');
    assert.deepEqual(outerMarginValues(labels, clean, original, format), original);
    assert.equal(
      outerMarginValues({ ...labels, left: '5.292' }, { ...clean, left: true }, original, format)
        .left,
      1500,
    );
  }
  assert.throws(() => outerMarginDraft({ ...zero, left: -1 }, 'hwpx'));
  assert.equal(outerMarginDraft({ ...zero, left: -1 }, 'hwp5').left, '-0.004');
});
test('all 11560 previously accepted nonnegative hundredth-mm inputs retain their legacy integer result', () => {
  let checked = 0;
  for (let hundredths = 0; hundredths <= 11559; hundredths++) {
    const text = (hundredths / 100).toFixed(2);
    assert.equal(outerMarginUnits(text), objectOffsetUnits(text), text);
    checked++;
  }
  assert.equal(checked, 11560);
  for (const text of ['+2.65', '+0', '+2.650']) {
    assert.throws(() => objectOffsetUnits(text));
    assert.throws(() => outerMarginUnits(text));
  }
});
