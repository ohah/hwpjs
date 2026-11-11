import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { prepareCharacterExtensions } from '../src/mutations/character-extensions.ts';
import { applyDocumentOperations } from '../src/document-operations.ts';
const sha = 'a'.repeat(64);
const operation = (paragraph) => ({
  kind: 'character-properties',
  coordinates: 'current-transaction',
  section: 0,
  paragraph,
  startUnit: 0,
  endUnit: 1,
  expectedRangeText: 'A',
  properties: { textColor: '#123456' },
});
const results = [];
function fixture(n, { onWrite } = {}) {
  const counts = {
    flows: 0,
    returnedRows: 0,
    bridgeIndexReads: 0,
    referenceQueries: 0,
    queries: 0,
    writes: 0,
    bindings: 0,
    saves: 0,
    closes: 0,
  };
  let revision = 0,
    serial = 0;
  const rows = Array.from({ length: n }, (_, i) => ({
    paragraph: i + 1,
    source_node: i + 1,
    host: 'body',
    top_level: true,
  }));
  const sdk = {
    enableHistoryV2() {},
    supportsAtomicFormatting: () => true,
    supportsSourceTableCellSplit: () => true,
    atomicFormattingCapabilities: () => ({
      format: 'hwpx',
      coordinateSpace: 'native-source-utf16',
      requiresHistoryProtocol: 2,
      fields: { 'character.textColor': { readable: true, writable: true, unit: 'RGB24' } },
      binding: { session: 'atomic', revision },
    }),
    sourceTableCellSplitBinding() {
      counts.bindings++;
      return { session: 'lease', revision, serial: String(serial) };
    },
    paragraphFlow() {
      counts.flows++;
      counts.returnedRows += n;
      return new Proxy(
        rows.map((x) => ({ ...x })),
        {
          get(target, key, receiver) {
            if (typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key)) counts.bridgeIndexReads++;
            return Reflect.get(target, key, receiver);
          },
        },
      );
    },
    anchorText: () => 'A',
    queryFormatting(request) {
      counts.queries++;
      return {
        binding: { session: 'atomic', revision },
        targets: [{ ref: 'issued-' + request.selectors[0].paragraph }],
        observations: {
          perTarget: [
            {
              fields: {
                'character.textColor': { state: 'known', writable: true, value: 0x123456 },
              },
            },
          ],
        },
      };
    },
    applyFormattingPatch() {
      counts.writes++;
      onWrite?.({ rows, counts });
      return { nativeCode: 2, application: 'unapplied', changed: false };
    },
    setCharacterProperties() {
      revision++;
      serial++;
    },
    setParagraphAlignment() {
      throw Error('LateNativeFailure');
    },
  };
  const document = {
    format: 'hwpx',
    sourceSha256: sha,
    sectionCount: 1,
    sdk,
    save() {
      counts.saves++;
      return new Uint8Array([2]);
    },
    close() {
      counts.closes++;
    },
  };
  return {
    counts,
    rows,
    document,
    mutate() {
      revision++;
      serial++;
    },
    undo() {
      revision--;
      serial++;
    },
  };
}
for (const n of [32, 64, 128])
  for (const direction of ['repeated', 'forward', 'reverse'])
    test(`real R2 planner controlled ${n} ${direction}: one initial section index and O(1) advance`, () => {
      const f = fixture(n),
        ops = Array.from({ length: n }, (_, i) =>
          operation(direction === 'repeated' ? 1 : direction === 'forward' ? i + 1 : n - i),
        );
      const plan = prepareCharacterExtensions(f.document, ops);
      assert.equal(f.counts.flows, 1);
      assert.equal(f.counts.bridgeIndexReads, n);
      for (const [index, op] of ops.entries()) {
        plan.apply(f.document, op, index);
        const before = { ...f.counts };
        plan.advance();
        assert.equal(f.counts.flows, before.flows);
        assert.equal(f.counts.bridgeIndexReads, before.bridgeIndexReads);
        assert.equal(f.counts.queries, before.queries);
        assert.equal(f.counts.bindings - before.bindings, 1);
      }
      assert.equal(f.counts.flows, n + 1);
      assert.equal(f.counts.returnedRows, n * (n + 1));
      assert.equal(f.counts.bridgeIndexReads, 2 * n);
      assert.equal(f.counts.queries, 3 * n);
      assert.equal(f.counts.writes, n);
      results.push({
        n,
        direction,
        ...f.counts,
        scope: 'controlled SDK: bridge index reads exclude Native/SDK row materialization',
      });
    });
test('unissued advance, receipt after undo ABA, foreign document and original future lineage remain fail-closed', () => {
  const f = fixture(2),
    ops = [operation(1), operation(2)],
    plan = prepareCharacterExtensions(f.document, ops);
  assert.throws(() => plan.advance(), /Unissued/);
  assert.throws(() => plan.apply({ ...f.document }, ops[0], 0), /Stale/);
  plan.apply(f.document, ops[0], 0);
  f.mutate();
  f.undo();
  assert.throws(() => plan.advance(), /Stale/);
  const g = fixture(2),
    next = prepareCharacterExtensions(g.document, ops);
  next.apply(g.document, ops[0], 0);
  next.advance();
  g.rows[1].source_node = 999;
  assert.throws(() => next.apply(g.document, ops[1], 1), /Stale/);
  assert.equal(g.counts.writes, 1);
  const h = fixture(2),
    third = prepareCharacterExtensions(h.document, ops);
  third.apply(h.document, ops[0], 0);
  third.advance();
  h.rows[1].host = 'table_cell';
  h.rows[1].top_level = false;
  assert.throws(() => third.apply(h.document, ops[1], 1), /Owner/);
});
test('fresh Native ref, source fingerprint, and slot/cardinality are checked immediately before write', () => {
  for (const fault of ['ref', 'source', 'slot', 'length']) {
    const f = fixture(2),
      op = operation(2),
      plan = prepareCharacterExtensions(f.document, [op]);
    if (fault === 'ref') {
      const original = f.document.sdk.queryFormatting;
      f.document.sdk.queryFormatting = (r) => ({
        ...original(r),
        targets: [{ ref: 'foreign-ref' }],
      });
    }
    if (fault === 'source') f.document.sourceSha256 = 'b'.repeat(64);
    if (fault === 'slot') f.rows[1].paragraph = 1;
    if (fault === 'length') f.rows.pop();
    assert.throws(() => plan.apply(f.document, op, 0));
    assert.equal(f.counts.writes, 0);
  }
});
test('legacy receipt does not bless an undo ABA or arbitrary structural callback', () => {
  const f = fixture(2),
    ext = operation(1),
    legacy = { ...operation(2), properties: { bold: true } },
    plan = prepareCharacterExtensions(f.document, [legacy, ext]);
  assert.throws(
    () =>
      plan.runLegacy(legacy, () => {
        f.mutate();
        f.undo();
      }),
    /Stale/,
  );
  assert.equal(f.counts.writes, 0);
});
for (const n of [32, 64, 128])
  test(`controlled full service ${n} both-direction late failure returns no bytes/save`, async () => {
    for (const direction of ['forward', 'reverse']) {
      const f = fixture(n),
        ops = Array.from({ length: n }, (_, i) =>
          operation(direction === 'forward' ? i + 1 : n - i),
        );
      const late = {
        kind: 'paragraph-alignment',
        coordinates: 'current-transaction',
        section: 0,
        paragraph: 0xffffffff,
        alignment: 'LEFT',
      };
      await assert.rejects(
        applyDocumentOperations(
          {
            bytes: new Uint8Array([1]),
            wasm: new Uint8Array([1]),
            expectedSha256: sha,
            operations: [...ops, late],
          },
          { openDocument: async () => f.document },
        ),
        /LateNativeFailure/,
      );
      assert.equal(f.counts.writes, n);
      assert.equal(f.counts.queries, 3 * n);
      assert.equal(f.counts.saves, 0);
      assert.equal(f.counts.closes, 1);
    }
  });
test.after(async () => {
  if (process.env.HWPJS_CHARACTER_PLAN_EVIDENCE)
    await writeFile(
      process.env.HWPJS_CHARACTER_PLAN_EVIDENCE,
      JSON.stringify(
        { scope: 'real R2 planner with controlled fake SDK; no Native speed claim', results },
        null,
        2,
      ) + '\n',
    );
});
test('multiple sections share exactly one initial index each and retain independent slot offsets', () => {
  const f = fixture(16),
    original = f.document.sdk.paragraphFlow;
  f.document.sectionCount = 2;
  f.document.sdk.paragraphFlow = (section) => {
    const flow = original();
    return new Proxy(
      flow.map((row) => ({ ...row, paragraph: row.paragraph + 16 * section })),
      {
        get(target, key, receiver) {
          if (typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key)) f.counts.bridgeIndexReads++;
          return Reflect.get(target, key, receiver);
        },
      },
    );
  };
  const operations = Array.from({ length: 32 }, (_, i) => ({
    ...operation(i + 1),
    section: i < 16 ? 0 : 1,
  })).reverse();
  const plan = prepareCharacterExtensions(f.document, operations);
  assert.equal(f.counts.flows, 2);
  for (const [index, operation] of operations.entries()) {
    plan.apply(f.document, operation, index);
    plan.advance();
  }
  assert.equal(f.counts.flows, 34);
  assert.equal(f.counts.queries, 96);
  assert.equal(f.counts.writes, 32);
});
test('future identical sibling changed during an earlier commit is rejected at its own apply with no file/save', async () => {
  let changed = false;
  const f = fixture(3, {
    onWrite({ rows }) {
      if (!changed) {
        changed = true;
        rows[2].source_node = 999;
      }
    },
  });
  await assert.rejects(
    applyDocumentOperations(
      {
        bytes: new Uint8Array([1]),
        wasm: new Uint8Array([1]),
        expectedSha256: sha,
        operations: [operation(1), operation(2), operation(3)],
      },
      { openDocument: async () => f.document },
    ),
    /Stale/,
  );
  assert.equal(f.counts.writes, 2);
  assert.equal(f.counts.saves, 0);
  assert.equal(f.counts.closes, 1);
});
