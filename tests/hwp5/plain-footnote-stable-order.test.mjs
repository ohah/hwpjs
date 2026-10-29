import test from 'node:test';
import assert from 'node:assert/strict';
import { stableSafeIntegerOrder as order } from '../../web/preview/stable-safe-integer-order.mjs';
import { paginatePlainFootnoteContinuations as after } from '../../web/preview/plain-footnote-continuation.mjs';

const expected = (items) => items.toSorted((a, b) => a.key - b.key);
const edges = [
  0,
  -0,
  1,
  255,
  256,
  65535,
  65536,
  2 ** 32 - 1,
  2 ** 32,
  2 ** 32 + 1,
  2 ** 48 - 1,
  2 ** 48,
  Number.MAX_SAFE_INTEGER - 1,
  Number.MAX_SAFE_INTEGER,
];
const mixed = (length) =>
  Array.from({ length }, (_, i) => ({ key: edges[(length - i - 1) % edges.length], id: i }));

test('full 53-bit keys retain every boundary and stable duplicate order', () => {
  const items = mixed(280);
  const snapshot = structuredClone(items);
  const result = order(items, (x) => x.key);
  assert.deepEqual(result, expected(items));
  assert.deepEqual(items, snapshot);
  for (const item of result) assert.equal(item, items[item.id]);
});
test('negative zero is retained and ties with positive zero in original order', () => {
  const items = [
    { key: 1, id: 0 },
    { key: -0, id: 1 },
    { key: 0, id: 2 },
    { key: -0, id: 3 },
  ];
  const result = order(items, (x) => x.key);
  assert.deepEqual(
    result.map((x) => x.id),
    [1, 2, 3, 0],
  );
  assert.equal(Object.is(result[0].key, -0), true);
});
for (const key of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  test(`invalid numeric domain is rejected without changing items: ${String(key)}`, () => {
    const items = [{ key: 2 }, { key }];
    const references = [...items];
    assert.throws(() => order(items, (x) => x.key), /InvalidStableIntegerOrderKey/);
    assert.deepEqual(items, references);
  });
}
test('extractor is called once per element and frozen input remains untouched', () => {
  const items = Object.freeze(mixed(64).map(Object.freeze));
  let calls = 0;
  const result = order(items, (x) => {
    calls++;
    return x.key;
  });
  assert.equal(calls, items.length);
  assert.deepEqual(result, expected(items));
});
test('sorted and equal-key batches do not execute radix or insertion loops', () => {
  const items = Array.from({ length: 128 }, (_, i) => ({ key: Math.floor(i / 4), id: i }));
  const counts = {};
  assert.deepEqual(
    order(items, (x) => x.key, counts),
    items,
  );
  assert.equal(counts.keyReads, 128);
  assert.equal(counts.radixPasses ?? 0, 0);
  assert.equal(counts.smallBatches ?? 0, 0);
});
test('small reverse batch has a fixed 120 comparison and move bound', () => {
  const items = Array.from({ length: 16 }, (_, i) => ({ key: 15 - i }));
  const counts = {};
  assert.deepEqual(
    order(items, (x) => x.key, counts),
    expected(items),
  );
  assert.equal(counts.smallComparisons, 120);
  assert.equal(counts.smallMoves, 120);
  assert.equal(counts.radixPasses ?? 0, 0);
});
for (const length of [32, 64, 128]) {
  test(`radix traversal counters are bounded at ${length} elements`, () => {
    const items = mixed(length);
    const counts = {};
    assert.deepEqual(
      order(items, (x) => x.key, counts),
      expected(items),
    );
    assert.equal(counts.keyReads, length);
    assert.ok(counts.radixPasses <= 7);
    assert.ok(counts.countVisits <= 7 * length);
    assert.ok(counts.scatterVisits <= 7 * length);
    assert.ok((counts.finalCopies ?? 0) <= length);
    assert.ok(counts.bucketClears <= 7 * 256);
  });
}
test('empty and singleton batches preserve references', () => {
  assert.deepEqual(
    order([], (x) => x.key),
    [],
  );
  const item = { key: Number.MAX_SAFE_INTEGER };
  assert.equal(order([item], (x) => x.key)[0], item);
});

const setting = {
  section_ordinal: 0,
  width: 7500,
  height: 7500,
  orientation: 'widely',
  gutter_type: 'left_only',
  duplicate_margins: 0,
  margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
};
const policy = {
  state: 'selected',
  kind: 'footnote',
  section: 0,
  aboveLine: 1,
  belowLine: 2,
  betweenNotes: 3,
  beneathText: false,
};
const rows = () =>
  Array.from({ length: 3 }, (_, i) => ({
    kind: 'text',
    section: 0,
    paragraph: i,
    startUnit: 0,
    endUnit: 2,
    x: 0,
    y: i * 10,
    width: 30,
    height: 10,
    text: 'ab',
  }));
const note = (noteNode, hostParagraph, anchorUnit) => ({
  kind: 'footnote',
  section: 0,
  noteNode,
  hostParagraph,
  anchorUnit,
  width: 100,
  height: 2,
  boxes: [],
  rows: [
    {
      kind: 'text',
      section: 0,
      paragraph: 100 + noteNode,
      startUnit: 0,
      endUnit: 1,
      x: 0,
      y: 0,
      width: 10,
      height: 2,
      text: String(noteNode),
    },
  ],
});
function compare(notes, body = rows()) {
  const snapshot = structuredClone({ notes, body });
  const flows = body.map((row) => ({
    section: 0,
    paragraph: row.paragraph,
    top_level: true,
    column_break: null,
    page_break: null,
  }));
  const b = after(body, setting, flows, notes, policy, 1);
  assert.deepEqual({ notes, body }, snapshot);
  return b;
}
test('same anchor different owners retain original stable order', () => {
  const result = compare([note(4, 0, 1), note(2, 0, 0), note(3, 0, 1), note(1, 0, -0)]);
  assert.equal(result.state, 'ready');
  const ids = result.page.pages.flatMap((p) =>
    result.notesFor(result.page.rows, p.ordinal, 0).map((n) => n.noteNode),
  );
  assert.deepEqual(ids, [2, 1, 4, 3]);
});
test('reverse group insertion still matches row then anchor ordering', () => {
  const result = compare([note(4, 2, 1), note(2, 0, 1), note(3, 1, 0), note(1, 0, 0)]);
  assert.equal(result.state, 'ready');
  const ids = result.page.pages.flatMap((p) =>
    result.notesFor(result.page.rows, p.ordinal, 0).map((n) => n.noteNode),
  );
  assert.deepEqual(ids, [1, 2, 3, 4]);
});
for (const key of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  test(`canonical invalid reservation stays first: ${String(key)}`, () => {
    const result = compare([note(1, 0, key), note(1, 0, 0)]);
    assert.equal(result.error, 'InvalidFootnoteReservation');
  });
}
test('duplicate owner rejection is unchanged', () => {
  assert.equal(compare([note(1, 0, 0), note(1, 0, 1)]).error, 'AmbiguousFootnoteContinuationOwner');
});
test('missing reference and maximum safe anchor are not truncated', () => {
  assert.equal(
    compare([note(1, 0, Number.MAX_SAFE_INTEGER)]).error,
    'MissingFootnoteContinuationReference',
  );
});
test('reversed source row ranges keep the original ambiguity error', () => {
  const body = rows();
  body[0].startUnit = 1;
  body[1].paragraph = 0;
  body[1].startUnit = 0;
  body[1].endUnit = 1;
  assert.equal(compare([note(1, 0, 1)], body).error, 'AmbiguousFootnoteContinuationReference');
});

test('64 anchors in reverse owner groups preserve independent composite stable order', () => {
  const body = rows();
  const flows = body.map((row) => ({
    section: 0,
    paragraph: row.paragraph,
    top_level: true,
    column_break: null,
    page_break: null,
  }));
  const notes = Array.from({ length: 64 }, (_, i) => {
    const value = note(1000 + i, (63 - i) % 3, (i * 7) % 2);
    value.height = 0.125;
    value.rows[0].height = 0.125;
    return value;
  });
  const compact = { ...policy, aboveLine: 0, belowLine: 0, betweenNotes: 0 };
  const b = after(body, setting, flows, notes, compact, 0);
  assert.equal(b.state, 'ready', b.error);
  const observed = b.page.pages.flatMap((p) =>
    b.notesFor(b.page.rows, p.ordinal, 0).map((n) => n.noteNode),
  );
  const expected = notes
    .toSorted((x, y) => x.hostParagraph - y.hostParagraph || x.anchorUnit - y.anchorUnit)
    .map((x) => x.noteNode);
  assert.deepEqual(observed, expected);
});
