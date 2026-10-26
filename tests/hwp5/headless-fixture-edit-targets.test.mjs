import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEditCandidates } from '../../tools/headless-fixture-edit-targets.mjs';
import { paragraphSelectionOwner } from '../../web/preview/paragraph-selection.mjs';

const row = (paragraph, extra = {}) => ({
  section: 0,
  paragraph,
  text: '본문😀',
  editable: true,
  selectionOwner: 'section:0:body',
  currentReference: { kind: 'original', section: 0, id: String(paragraph), epoch: '1', scope: '1' },
  ...extra,
});
const candidates = (paragraphs, format = 'hwp5') => fixtureEditCandidates({ format, paragraphs });

test('stable body, known nested, anchored, empty priority; canonical owners', () => {
  const rows = [
    row(0, { text: '' }),
    row(1, { text: '\ufffc😀글' }),
    row(2, { tableCell: { tableNode: 3, listNode: 4 }, selectionOwner: null }),
    row(3),
    row(4, { drawingText: { drawingNode: 5, listNode: 6 } }),
    row(5, { drawingCaption: { drawingNode: 5, listNode: 7 } }),
    row(6),
    row(7, { text: '\t\ufffc\ufffc😀' }),
    row(8, { text: '' }),
  ];
  const result = candidates(rows);
  assert.deepEqual(
    result.map((x) => x.row.paragraph),
    [3, 6, 2, 4, 5, 1, 7, 0, 8],
  );
  for (const target of result) {
    assert.equal(target.row, rows[target.row.paragraph]);
    assert.equal(target.owner, paragraphSelectionOwner(target.row));
    assert.equal(
      target.startUnit,
      target.row.paragraph === 1 ? 1 : target.row.paragraph === 7 ? 3 : 0,
    );
  }
});

test('malformed content, unknown formats and unsafe coordinates are excluded', () => {
  for (const input of [
    null,
    [],
    {},
    { format: 'hwp5', paragraphs: {} },
    { format: 'other', paragraphs: [row(0)] },
  ])
    assert.deepEqual(fixtureEditCandidates(input), []);
  for (const value of [
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    0x100000000,
    '0',
    null,
  ]) {
    assert.deepEqual(candidates([row(0, { section: value })]), []);
    assert.deepEqual(candidates([row(value)]), []);
  }
  assert.equal(candidates([row(0xffffffff)]).length, 1);
  const edge = row(0, {
    section: 0xffffffff,
    selectionOwner: 'section:4294967295:body',
    currentReference: { kind: 'original', section: 0xffffffff },
  });
  assert.equal(candidates([edge]).length, 1);
});

test('reject unavailable, generated, unknown and conflicting owners without synthesizing body', () => {
  const bad = [
    null,
    [],
    row(0, { editable: false }),
    row(1, { editable: 1 }),
    row(2, { clipped: true }),
    row(3, { createdCell: {} }),
    row(4, { selectionOwner: null }),
    row(5, { selectionOwner: 'section:0:unknown:list:2' }),
    row(6, { tableCell: { tableNode: 2 } }),
    row(7, { tableCell: {} }),
    row(8, {
      tableCell: { tableNode: 1, listNode: 2 },
      drawingText: { drawingNode: 1, listNode: 2 },
    }),
    row(9, {
      drawingText: { drawingNode: 1, listNode: 2 },
      drawingCaption: { drawingNode: 1, listNode: 2 },
    }),
    row(10, { drawingText: { drawingNode: 0x100000000, listNode: 1 } }),
    row(11, { tableCell: { tableNode: Number.MAX_SAFE_INTEGER + 1, listNode: 1 } }),
  ];
  assert.deepEqual(candidates(bad), []);
});

test('HWP5 requires attached original reference; HWPX does not guess one', () => {
  for (const currentReference of [
    undefined,
    null,
    {},
    { kind: 'cell', section: 0 },
    { kind: 'generated', section: 0 },
    { kind: 'original', section: 1 },
  ])
    assert.deepEqual(candidates([row(0, { currentReference })]), []);
  const original = row(0, { currentReference: undefined });
  assert.equal(candidates([original], 'hwpx')[0].row, original);
  assert.equal(original.currentReference, undefined);
});

test('duplicate identities exclude all matches even if one is otherwise ineligible', () => {
  assert.deepEqual(candidates([row(0), row(0, { clipped: true })]), []);
  assert.deepEqual(candidates([row(0), row(0, { tableCell: { tableNode: 2, listNode: 3 } })]), []);
  assert.equal(
    candidates([
      row(0),
      row(0, {
        section: 1,
        selectionOwner: 'section:1:body',
        currentReference: { kind: 'original', section: 1 },
      }),
    ]).length,
    2,
  );
});

test('well formed scalar strings and leading anchors produce safe collapsed offsets', () => {
  for (const text of [undefined, null, 12, '\ud800', '\udc00', 'a\ud800', '\ufffc😀\udc00'])
    assert.deepEqual(candidates([row(0, { text })]), []);
  for (const text of ['\ufffc', '\ufffc\t', '\t', '\u0001\ufffc'])
    assert.equal(candidates([row(0, { text })])[0].startUnit, text.length);
  for (const [text, start] of [
    ['😀', 0],
    ['\ufffc\ufffc😀x', 2],
    ['\t😀', 1],
    ['\u0001\t\ufffc𐀀', 3],
    ['', 0],
    [' text', 0],
  ]) {
    const target = candidates([row(0, { text })])[0];
    assert.equal(target.startUnit, start);
    assert.ok(start === text.length || !/[\udc00-\udfff]/u.test(text[start]));
  }
});

test('borrowed complete row and metadata remain unchanged, including frozen inputs', () => {
  const original = row(0, {
    metadata: { nested: ['keep'] },
    sourceOffsets: [{ at: 1, source: 8 }],
  });
  const content = { format: 'hwp5', paragraphs: [original], metadata: { untouched: true } };
  const before = structuredClone(content);
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  }
  freeze(content);
  const [target] = fixtureEditCandidates(content);
  assert.equal(target.row, original);
  assert.equal(target.row.currentReference, original.currentReference);
  assert.equal(target.row.metadata, original.metadata);
  assert.deepEqual(Object.keys(target), ['row', 'startUnit', 'owner']);
  assert.deepEqual(content, before);
});

test('large inventories are not silently truncated', () => {
  const rows = Array.from({ length: 20001 }, (_, i) => row(i));
  const result = candidates(rows);
  assert.equal(result.length, rows.length);
  assert.equal(result.at(-1).row, rows.at(-1));
});
