import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateHwp5FieldTopology,
  decodeHwp5FieldTopology,
} from '../../js/hwp5-field-topology.mjs';
const report = () => ({
  spans: [
    {
      begin: { paragraph: 0, unit: 8 },
      end: { paragraph: 1, unit: 0 },
      ordinal: 0,
      field_id: 0x25636c6b,
    },
  ],
  unresolved: [
    {
      kind: 'orphan_end',
      position: { paragraph: 2, unit: 0 },
      marker_id: 0x00636c6b,
      ordinal: null,
      list_node: null,
    },
    {
      kind: 'unclosed_start',
      position: { paragraph: 3, unit: 8 },
      marker_id: 0x25636c6b,
      ordinal: 0,
      list_node: 236,
    },
  ],
});
test('field topology wire preserves diagnostics without adding closure or permission', () => {
  const value = report(),
    before = structuredClone(value);
  assert.deepEqual(decodeHwp5FieldTopology(new TextEncoder().encode(JSON.stringify(value))), value);
  assert.deepEqual(value, before);
  assert.deepEqual(validateHwp5FieldTopology({ spans: [], unresolved: [], editable: true }), {
    spans: [],
    unresolved: [],
  });
  assert.throws(() => decodeHwp5FieldTopology(Uint8Array.of(0xff)), TypeError);
});
test('field topology wire rejects malformed ranges diagnostics identities and ordering', () => {
  const mutations = [
    (v) => {
      delete v.spans;
    },
    (v) => {
      v.unresolved = null;
    },
    (v) => {
      v.spans[0].end.paragraph = 0;
      v.spans[0].end.unit = 0;
    },
    (v) => {
      v.spans.push(structuredClone(v.spans[0]));
    },
    (v) => {
      v.spans[0].ordinal = -1;
    },
    (v) => {
      v.spans[0].field_id = 2 ** 32;
    },
    (v) => {
      v.unresolved[0].kind = 'guessed_end';
    },
    (v) => {
      v.unresolved[0].ordinal = 0;
    },
    (v) => {
      v.unresolved[1].ordinal = null;
    },
    (v) => {
      v.unresolved[1].list_node = -1;
    },
    (v) => {
      v.unresolved[1].marker_id = '0';
    },
    (v) => {
      v.unresolved.reverse();
    },
    (v) => {
      v.unresolved.push(structuredClone(v.unresolved[1]));
    },
    (v) => {
      v.unresolved[1].position.unit = NaN;
    },
    (v) => {
      v.unresolved[1].position.paragraph = 0;
      v.unresolved[0].position.paragraph = 0;
    },
  ];
  for (const mutate of mutations) {
    const value = report();
    mutate(value);
    assert.throws(() => validateHwp5FieldTopology(value), /InvalidHwp5FieldTopology/);
  }
});
