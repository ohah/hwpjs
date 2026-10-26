import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeHwp5FieldSpans, validateHwp5FieldSpans } from '../../js/hwp5-field-spans.mjs';

const span = () => ({
  source_node: 7,
  field_id: 0x25636c6b,
  ordinal: 0,
  begin: { paragraph: 0, unit: 8 },
  end: { paragraph: 2, unit: 0 },
});

test('field span wire retains cross-paragraph and empty current ranges', () => {
  const row = span(),
    before = structuredClone(row);
  assert.deepEqual(decodeHwp5FieldSpans(new TextEncoder().encode(JSON.stringify([row]))), [row]);
  assert.deepEqual(row, before);
  row.end = { ...row.begin };
  assert.equal(validateHwp5FieldSpans([row])[0], row);
  assert.deepEqual(validateHwp5FieldSpans([]), []);
});

test('field span wire refuses forged coordinates, duplicates and malformed payloads', () => {
  for (const mutate of [
    (row) => {
      row.begin.paragraph = '0';
    },
    (row) => {
      row.end.unit = -1;
    },
    (row) => {
      row.ordinal = 0x100000000;
    },
    (row) => {
      row.end.paragraph = 0;
      row.end.unit = 7;
    },
    (row) => {
      row.begin.paragraph = 3;
    },
    (row) => {
      row.source_node = null;
    },
    (row) => {
      row.end = null;
    },
  ]) {
    const row = span();
    mutate(row);
    assert.throws(() => validateHwp5FieldSpans([row]), /InvalidHwp5FieldSpans/);
  }
  assert.throws(() => validateHwp5FieldSpans([span(), span()]), /InvalidHwp5FieldSpans/);
  assert.throws(() => validateHwp5FieldSpans({}), /InvalidHwp5FieldSpans/);
  assert.throws(() => decodeHwp5FieldSpans(Uint8Array.of(0xff)), TypeError);
  assert.throws(() => decodeHwp5FieldSpans(new TextEncoder().encode('{')), SyntaxError);
});
