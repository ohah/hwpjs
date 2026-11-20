import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCreatedCellCharacterRuns,
  createdCellCharacterRanges,
} from '../../js/created-cell-character-runs.mjs';
import { decodeCreatedTables, validateCreatedTables } from '../../js/hwpx-created-tables.mjs';
import { layoutCreatedTable } from '../../web/preview/created-table-layout.mjs';
import { projectCreatedCellDraft } from '../../web/preview/created-cell-draft.mjs';
const runs = () => [
  { start_unit: 0, char_shape_id: 0 },
  { start_unit: 1, char_shape_id: 7 },
  { start_unit: 4, char_shape_id: 0 },
];
const table = () => ({
  identity: '9007199254740993',
  instance_id: 17,
  host_paragraph: 1,
  anchor_unit: 0,
  rows: 1,
  columns: 1,
  width: 7200,
  height: 1000,
  resources: { character: 0, paragraph: 0, style: 0, border_fill: 1 },
  cells: [
    {
      paragraph_id: 100,
      row: 0,
      column: 0,
      x: 0,
      y: 0,
      width: 7200,
      height: 1000,
      text: 'A한😀B',
      character_runs: runs(),
    },
  ],
});
const encode = (v) => new TextEncoder().encode(JSON.stringify(v));
test('both host ordinal profiles retain every native run, including resource zero', () => {
  const value = table();
  assert.deepEqual(decodeCreatedTables(encode([value])), [value]);
  value.host_paragraph = 0;
  assert.equal(validateCreatedTables([value], { hostBase: 0 })[0], value);
  assert.deepEqual(createdCellCharacterRanges(value.cells[0], 99), [
    { start: 0, end: 1, charShapeId: 0 },
    { start: 1, end: 4, charShapeId: 7 },
    { start: 4, end: 5, charShapeId: 0 },
  ]);
});
test('rich cell decoder rejects malformed maps without guessing indices or flattening', () => {
  const cases = [
    [],
    [{ start_unit: 1, char_shape_id: 1 }],
    [{ start_unit: 0, char_shape_id: -1 }],
    [
      { start_unit: 0, char_shape_id: 0 },
      { start_unit: 3, char_shape_id: 2 },
    ],
    [
      { start_unit: 0, char_shape_id: 0 },
      { start_unit: 6, char_shape_id: 2 },
    ],
    [
      { start_unit: 0, char_shape_id: 0 },
      { start_unit: 0, char_shape_id: 2 },
    ],
    [{ start_unit: 0, charShapeId: 0 }],
    [{ start_unit: 0, char_shape_id: 0, source_node: 7 }],
  ];
  for (const map of cases) {
    const value = table();
    value.cells[0].character_runs = map;
    assert.throws(() => decodeCreatedTables(encode([value])), /InvalidCreatedTables/);
  }
  const wrong = table();
  wrong.cells[0].text = null;
  assert.throws(() => decodeCreatedTables(encode([wrong])), /InvalidCreatedTables/);
});
test('empty paragraph and explicit EOF style boundary remain observable', () => {
  assert.deepEqual(
    createdCellCharacterRanges(
      { text: '', character_runs: [{ start_unit: 0, char_shape_id: 9 }] },
      0,
    ),
    [{ start: 0, end: 0, charShapeId: 9 }],
  );
  const withEnd = [...runs(), { start_unit: 5, char_shape_id: 17 }];
  assert.equal(validateCreatedCellCharacterRuns('A한😀B', withEnd), withEnd);
  assert.deepEqual(
    createdCellCharacterRanges({ text: 'A한😀B', character_runs: withEnd }, 0).at(-1),
    { start: 5, end: 5, charShapeId: 17 },
  );
});
test('legacy snapshots use their explicit parent default and do not acquire rich capability', () => {
  const value = table();
  delete value.cells[0].character_runs;
  assert.deepEqual(decodeCreatedTables(encode([value])), [value]);
  assert.deepEqual(createdCellCharacterRanges(value.cells[0], 0), [
    { start: 0, end: 5, charShapeId: 0 },
  ]);
  assert.equal(Object.hasOwn(value, 'createdCellRichTypingScope'), false);
});
test('actual generated-table layout exposes the complete run map without mutating Native observations', () => {
  const value = { ...table(), section: 0 };
  const before = structuredClone(value);
  const result = layoutCreatedTable(value, (text) => ({ width: [...text].length * 8, height: 16 }));
  assert.deepEqual(
    result.paragraphs[0].characterRanges,
    createdCellCharacterRanges(value.cells[0], 0),
  );
  assert.deepEqual(value, before);
});
test('IME preview deletion rebases display ranges and preserves canonical Native runs', () => {
  const value = { ...table(), section: 0 };
  const content = { paragraphs: [], createdTables: [value] };
  const before = structuredClone(content);
  const display = projectCreatedCellDraft(content, {
    section: 0,
    createdCell: { identity: value.identity, row: 0, column: 0 },
    text: 'AB',
  });
  assert.equal(display.createdTables[0].cells[0].text, 'AB');
  const layout = layoutCreatedTable(display.createdTables[0], (text) => ({
    width: text.length * 8,
    height: 16,
  }));
  assert.equal(layout.paragraphs[0].characterRanges.at(-1).end, 2);
  assert.deepEqual(display.createdTables[0].cells[0].character_runs, runs());
  assert.deepEqual(content, before);
});
test('a large native map preserves scalar order and each explicit resource', () => {
  const text = 'a'.repeat(10000);
  const value = Array.from({ length: text.length }, (_, i) => ({
    start_unit: i,
    char_shape_id: i % 2,
  }));
  assert.equal(validateCreatedCellCharacterRuns(text, value), value);
  const ranges = createdCellCharacterRanges({ text, character_runs: value }, 0);
  assert.equal(ranges.length, text.length);
  assert.deepEqual(ranges.at(-1), { start: 9999, end: 10000, charShapeId: 1 });
});
