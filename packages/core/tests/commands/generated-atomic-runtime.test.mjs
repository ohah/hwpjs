import test from 'node:test';
import assert from 'node:assert/strict';
import { queryAtomicFormatting } from '../../../../web/preview/atomic-formatting-command.mjs';
import { validateHwp5CurrentBodyReference } from '../../../../web/preview/hwp5-current-body-reference.mjs';

const ref = (paragraph = 3, section = 0, epoch = '7') => ({
  epoch,
  scope: 'native-session',
  kind: paragraph === 0 ? 'original' : 'generated',
  section,
  id: String(90 + paragraph),
  row: 0,
  column: 0,
});
const selector = (paragraph = 3, section = 0) => ({
  kind: 'original-paragraph',
  section,
  paragraph,
  reference: ref(paragraph, section),
});
function native(options = {}) {
  const wires = [],
    reads = [],
    flows = [],
    events = [];
  let epoch = '7';
  const editor = {
    supportsAtomicFormatting: () => true,
    atomicFormattingCapabilities: () => ({
      atomic: true,
      binding: { session: 'native-binding', revision: 5 },
      limits: { targets: 4096 },
    }),
    supportsCurrentSourceReferences: () => true,
    currentSourceReferences(section, window) {
      reads.push({ section, ...window });
      events.push('reference');
      const total = options.total ?? 2050;
      return {
        version: 1,
        total,
        first: window.first,
        references: Array.from({ length: Math.min(window.count, total - window.first) }, (_, i) =>
          ref(window.first + i, section, epoch),
        ),
        ...options.window,
      };
    },
    paragraphFlow(section) {
      flows.push(section);
      events.push('flow');
      return Array.from({ length: options.total ?? 2050 }, (_, paragraph) => ({
        paragraph,
        host: options.nested === paragraph ? 'cell' : 'body',
        top_level: options.notTop !== paragraph,
      }));
    },
    queryFormatting(wire) {
      events.push('query');
      wires.push(wire);
      return wire;
    },
  };
  return {
    editor,
    wires,
    reads,
    flows,
    events,
    advance: () => {
      epoch = '8';
    },
  };
}
test('mixed selectors use current source slots, strip references, and preserve binding/ranges/fields', () => {
  const h = native();
  const rows = [
    selector(0),
    { ...selector(), ranges: [{ startUnit: 8, endUnit: 10 }] },
    { kind: 'original-paragraph', section: 0, paragraph: 4 },
  ];
  const input = structuredClone(rows);
  queryAtomicFormatting(h.editor, 'hwp5', { selectors: rows, fields: [] });
  assert.deepEqual(rows, input);
  assert.deepEqual(h.wires[0], {
    schemaVersion: 1,
    binding: { session: 'native-binding', revision: 5 },
    fields: [],
    selectors: [
      { kind: 'original-paragraph', section: 0, paragraph: 0 },
      {
        kind: 'original-paragraph',
        section: 0,
        paragraph: 3,
        ranges: [{ startUnit: 8, endUnit: 10 }],
      },
      { kind: 'original-paragraph', section: 0, paragraph: 4 },
    ],
  });
  assert.deepEqual(h.reads, [{ section: 0, first: 0, count: 1024 }]);
  assert.deepEqual(h.flows, [0]);
  assert.equal(h.events.at(-1), 'query');
  console.log(JSON.stringify({ scope: 'synthetic-native-wire-capture', wire: h.wires[0] }));
});
test('cap-sized batch shares section flow/windows and does not reuse them across queries', () => {
  const h = native();
  const rows = Array.from({ length: 4096 }, (_, i) => selector(i % 2050, i % 2));
  queryAtomicFormatting(h.editor, 'hwp5', { selectors: rows });
  assert.equal(h.reads.length, 6);
  assert.deepEqual(h.flows, [0, 1]);
  assert.equal(h.wires[0].selectors.length, 4096);
  console.log(
    JSON.stringify({
      scope: 'query-local-ownership-read-counts',
      selectors: 4096,
      sections: 2,
      flowReads: h.flows.length,
      referenceWindows: h.reads.length,
    }),
  );
  queryAtomicFormatting(h.editor, 'hwp5', { selectors: rows });
  assert.equal(h.reads.length, 12);
  assert.equal(h.flows.length, 4);
  h.advance();
  assert.throws(
    () => queryAtomicFormatting(h.editor, 'hwp5', { selectors: rows }),
    /InvalidCurrentFormattingReference/,
  );
  assert.equal(h.wires.length, 2);
});
for (const change of [
  { epoch: '8' },
  { scope: 'other' },
  { kind: 'original' },
  { section: 1 },
  { id: '0' },
  { id: '01' },
  { id: '4294967296' },
  { row: 1 },
  { column: 1 },
  { extra: 1 },
  { epoch: '0' },
  { epoch: '01' },
  { scope: '' },
])
  test(
    'malformed/stale/wrong-slot reference preflights entire mixed batch: ' + JSON.stringify(change),
    () => {
      const h = native();
      assert.throws(
        () =>
          queryAtomicFormatting(h.editor, 'hwp5', {
            selectors: [selector(0), { ...selector(), reference: { ...ref(), ...change } }],
          }),
        /InvalidCurrentFormattingReference/,
      );
      assert.equal(h.wires.length, 0);
    },
  );
test('missing fields, explicit undefined/null, accessor and extra symbol refuse before query', () => {
  const values = [undefined, null];
  for (const key of Object.keys(ref())) {
    const missing = ref();
    delete missing[key];
    values.push(missing);
  }
  let visits = 0;
  const accessor = ref();
  Object.defineProperty(accessor, 'id', {
    get() {
      visits++;
      return '93';
    },
  });
  values.push(accessor, { ...ref(), [Symbol('extra')]: true });
  for (const reference of values) {
    const h = native();
    assert.throws(
      () =>
        queryAtomicFormatting(h.editor, 'hwp5', {
          selectors: [selector(0), { ...selector(), reference }],
        }),
      /InvalidCurrentFormattingReference/,
    );
    assert.equal(h.wires.length, 0);
  }
  assert.equal(visits, 0);
});
for (const options of [{ nested: 3 }, { notTop: 3 }])
  test(
    'exact current identity still refuses non-top-level BODY: ' + JSON.stringify(options),
    () => {
      const h = native(options);
      assert.throws(
        () =>
          queryAtomicFormatting(h.editor, 'hwp5', {
            selectors: [selector(0), selector()],
          }),
        /UnsupportedFormattingOwner/,
      );
      assert.equal(h.wires.length, 0);
    },
  );
for (const window of [{ version: 2 }, { first: 1 }, { total: 2 }, { references: [] }])
  test('invalid Native window refuses query: ' + JSON.stringify(window), () => {
    const h = native({ window });
    assert.throws(
      () => queryAtomicFormatting(h.editor, 'hwp5', { selector: selector() }),
      /InvalidCurrentFormattingReference/,
    );
    assert.equal(h.wires.length, 0);
  });
test('invalid batch coordinates and limit refuse before any source read/query', () => {
  for (const message of [
    { selectors: [] },
    { selector: selector(), selectors: [selector()] },
    { selectors: Array(4097).fill(selector()) },
    { selectors: [selector(), { ...selector(), paragraph: -1 }] },
    { selectors: [selector(), { ...selector(), section: 0x100000000 }] },
  ]) {
    const h = native();
    assert.throws(
      () => queryAtomicFormatting(h.editor, 'hwp5', message),
      /InvalidFormattingSelector/,
    );
    assert.equal(h.reads.length, 0);
    assert.equal(h.wires.length, 0);
  }
});
test('legacy no-ref and HWPX keep existing ordinal transforms without source metadata reads', () => {
  const h = native();
  const legacy = { kind: 'original-paragraph', section: 0, paragraph: 3 };
  queryAtomicFormatting(h.editor, 'hwp5', { selector: legacy });
  queryAtomicFormatting(h.editor, 'hwpx', { selectors: [legacy] });
  assert.deepEqual(h.wires[0].selectors, [legacy]);
  assert.deepEqual(h.wires[1].selectors, [{ ...legacy, paragraph: 4 }]);
  assert.equal(h.wires[0].fields, undefined);
  assert.deepEqual(h.reads, []);
  assert.deepEqual(h.flows, []);
});
test('G01 helper callers still read exactly one slot with no cross-call cache', () => {
  const h = native();
  for (let i = 0; i < 2; i++)
    validateHwp5CurrentBodyReference(
      h.editor,
      { ...selector(), reference: ref() },
      'G01Reference',
      'G01Owner',
    );
  assert.deepEqual(h.reads, Array(2).fill({ section: 0, first: 3, count: 1 }));
  assert.deepEqual(h.flows, [0, 0]);
});

test('widely spread selectors read each occupied window once and share one section flow', () => {
  const total = 2_000_000;
  const h = native({ total });
  const rows = Array.from({ length: 128 }, (_, i) => selector(i * 15 * 1024));
  // Sparse synthetic flow avoids allocating the two-million-row Native result.
  // This proves call counts only, not Native flow construction time or memory.
  const flow = [];
  flow.length = total;
  for (const row of rows)
    flow[row.paragraph] = { paragraph: row.paragraph, host: 'body', top_level: true };
  h.editor.paragraphFlow = (section) => {
    h.flows.push(section);
    return flow;
  };
  const selectors = Array.from({ length: 4096 }, (_, i) => rows[i % rows.length]);
  queryAtomicFormatting(h.editor, 'hwp5', { selectors });
  assert.equal(h.reads.length, 128);
  assert.deepEqual(h.flows, [0]);
  assert.equal(new Set(h.reads.map((read) => read.first)).size, 128);
  assert(h.reads.every((read) => read.count === 1024));
  assert.equal(h.wires[0].selectors.length, 4096);
  console.log(
    JSON.stringify({
      scope: 'synthetic-spread-window-counts',
      selectors: 4096,
      distinctSlots: 128,
      sectionTotal: total,
      occupiedWindows: h.reads.length,
      referenceRowsReturned: h.reads.length * 1024,
      flowReads: h.flows.length,
      nativeTimingVerified: false,
    }),
  );
});
