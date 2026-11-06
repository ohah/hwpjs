import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeTableBorderSources } from '../../js/hwpx-table-border-sources.mjs';
const fields = [
  'slash_crooked',
  'slash_is_counter',
  'back_slash_crooked',
  'back_slash_is_counter',
  'break_cell_separate_line',
];
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
function sample() {
  return {
    sourceOnly: true,
    cells: [{ table_node: 1, cell_node: 3, list_node: 4, border_fill_id: 0, style_index: 0 }],
    styles: [
      {
        id: 0,
        node: 5,
        edges: [null, null, null, null],
        diagonal: null,
        slash: null,
        back_slash: null,
        slash_node: null,
        back_slash_node: null,
        three_d: null,
        shadow: null,
        center_line: null,
        fill_node: null,
        unknown_children: 0,
      },
    ],
  };
}
test('raw diagonal decoder retains old Native absence without injecting optional keys', () => {
  const old = sample(),
    out = decodeTableBorderSources(encode(old));
  assert.deepEqual(out, old);
  for (const key of fields) assert.equal(Object.hasOwn(out.styles[0], key), false);
});
for (const field of fields) {
  test(`raw diagonal decoder ${field} preserves null zero nonzero empty and future strings`, () => {
    for (const value of [null, '0', '2', '', 'true', 'A&B', 'FUTURE']) {
      const input = sample();
      input.styles[0][field] = value;
      const out = decodeTableBorderSources(encode(input));
      assert.equal(Object.hasOwn(out.styles[0], field), true);
      assert.equal(out.styles[0][field], value);
      for (const other of fields.filter((key) => key !== field))
        assert.equal(Object.hasOwn(out.styles[0], other), false);
    }
  });
  test(`raw diagonal decoder ${field} refuses coercion containers and oversized strings`, () => {
    for (const value of [0, 1, false, true, [], {}, 'a'.repeat(4097)]) {
      const input = sample();
      input.styles[0][field] = value;
      assert.throws(() => decodeTableBorderSources(encode(input)), /InvalidTableBorderSources/);
    }
    const input = sample();
    input.styles[0][field] = 'a'.repeat(4096);
    assert.equal(decodeTableBorderSources(encode(input)).styles[0][field].length, 4096);
  });
}
test('raw diagonal decoder all new fields coexist independently without changing old values', () => {
  const input = sample();
  Object.assign(input.styles[0], {
    slash: 'FUTURE',
    back_slash: 'NONE',
    slash_crooked: null,
    slash_is_counter: '0',
    back_slash_crooked: '3',
    back_slash_is_counter: 'false',
    break_cell_separate_line: '',
  });
  assert.deepEqual(decodeTableBorderSources(encode(input)), input);
});
