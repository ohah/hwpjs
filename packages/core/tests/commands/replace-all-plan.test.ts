import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../src/state/editor-state.ts';
import { planReplaceAll } from '../../src/commands/replace-all.ts';
const token = {
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 2,
  viewRevision: 3,
};
const reference = {
  epoch: '7',
  scope: 'native-session',
  kind: 'original',
  section: 0,
  id: '99',
  row: 0,
  column: 0,
};
function row(text = 'aaaa', change: any = {}) {
  return {
    section: 0,
    paragraph: 0,
    text,
    editable: true,
    selectionOwner: 'section:0:body',
    currentReference: reference,
    ...change,
  };
}
function state(rows = [row()], content: any = {}, change: any = {}) {
  return new EditorState({
    ...token,
    stateVersion: 4,
    status: 'ready',
    nativeHistoryRevision: 9,
    content: {
      format: 'hwp5',
      totalParagraphs: rows.length,
      paragraphs: rows,
      limited: false,
      ...content,
    },
    ...change,
  });
}
const request = (s: EditorState, change: any = {}) => ({
  schemaVersion: 1 as const,
  query: 'aa',
  replacement: 'b',
  layoutToken: s.token,
  stateVersion: s.stateVersion,
  ...change,
});
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

test('all nonoverlapping matches, expected slices and owned fences are planning only', () => {
  const input = [row()],
    s = state(input),
    before = s.content;
  const req = request(s);
  const p = planReplaceAll(s, req);
  assert.deepEqual(
    p.edits.map((e) => [e.target.startUnit, e.target.endUnit, e.expectedOriginal, e.replacement]),
    [
      [0, 2, 'aa', 'b'],
      [2, 4, 'aa', 'b'],
    ],
  );
  assert.equal(p.executionAuthority, false);
  assert.equal(p.status, 'requires-native-preflight');
  assert.equal(p.coverage.nativeVerified, false);
  assert(p.coverage.requirements.length >= 6);
  assert.equal(p.nativeHistoryRevision, 9);
  assert.deepEqual(plain(p.layoutToken), token);
  assert.notEqual(p.layoutToken, req.layoutToken);
  assert.notEqual(p.edits[0].source.reference, reference);
  assert(Object.isFrozen(p));
  assert(Object.isFrozen(p.edits));
  assert(Object.isFrozen(p.edits[0].source.reference));
  assert.equal(p.edits[0].source.paragraph, 0);
  assert.equal(p.edits[0].source.reference!.id, '99');
  assert.equal(s.content, before);
  input[0].text = 'changed';
  reference.id = '100';
  assert.equal(p.edits[0].expectedOriginal, 'aa');
  assert.equal(p.edits[0].source.reference!.id, '99');
  reference.id = '99';
});
test('no match and same replacement are explicit no-ops without editing an observation', () => {
  for (const [query, replacement, count] of [
    ['z', '', 0],
    ['aa', 'aa', 2],
  ]) {
    const s = state(),
      before = s.content;
    const p = planReplaceAll(s, request(s, { query, replacement }));
    assert.equal(p.status, 'known-no-op');
    assert.equal(p.matchCount, count);
    assert.equal(p.edits.length, 0);
    assert.equal(p.executionAuthority, false);
    assert.equal(s.content, before);
  }
  const s = state();
  const deletion = planReplaceAll(s, request(s, { replacement: '' }));
  assert.equal(deletion.totals.outputUnits, 0);
  assert.equal(deletion.edits.length, 2);
});
test('newlines are preserved literally; structural and format policy remains a Native requirement', () => {
  const s = state();
  const p = planReplaceAll(s, request(s, { replacement: '\r\n\n' }));
  assert.equal(p.edits[0].replacement, '\r\n\n');
  assert.equal(p.newlinePolicy, 'literal-preserved-native-adapter-policy-required');
});
test('partial, clipped, sparse, duplicate and count-mismatched snapshots refuse even with no match', () => {
  for (const patch of [
    { window: {} },
    { limited: true },
    { limited: 0 },
    { totalParagraphs: 2 },
    { totalParagraphs: undefined },
    { paragraphs: [row(), row()], totalParagraphs: 2 },
    { paragraphs: [row('x', { clipped: true })] },
  ]) {
    const s = state(undefined, patch);
    assert.throws(
      () => planReplaceAll(s, request(s, { query: 'absent' })),
      /IncompleteReplaceAllSnapshot|AmbiguousDocumentText/,
    );
  }
  const sparse: any[] = [];
  sparse.length = 1;
  const s = state(sparse);
  assert.throws(() => planReplaceAll(s, request(s)), /IncompleteReplaceAllSnapshot/);
});
test('all matched protected/readOnly/field/created owners refuse whole plan without a partial DTO', () => {
  for (const patch of [
    { editable: false },
    { selectionOwner: null },
    { createdCell: {} },
    { fieldLabels: [{ start: 0, end: 2 }] },
    { manualFormulaResults: [{ start: 0, end: 2 }] },
    { fieldReadOnlyReason: 'Protected' },
    { textSourcePolicyError: 'Protected' },
  ]) {
    const s = state([row(), row('aaaa', { paragraph: 1, ...patch })]);
    assert.throws(
      () => planReplaceAll(s, request(s)),
      /SelectionNotEditable|InvalidSelectionOwner|CreatedCellRequiresSurfacePort|UnsupportedReplaceAllFieldOwner/,
    );
  }
  for (const s of [
    state(undefined, { readOnly: true }),
    state(undefined, {}, { capabilities: { readOnly: true } }),
  ])
    assert.throws(() => planReplaceAll(s, request(s)), /ReadOnlyDocument/);
});
test('canonical original nested table/drawing owners and generated body use existing selection admission', () => {
  for (const patch of [
    { tableCell: { tableNode: 1, listNode: 2 }, selectionOwner: undefined },
    { drawingText: { drawingNode: 1, listNode: 2 }, selectionOwner: undefined },
    { drawingCaption: { drawingNode: 1, listNode: 2 }, selectionOwner: undefined },
    { selectionOwner: 'section:0:note:1' },
    { currentReference: { ...reference, kind: 'generated', id: '2' } },
  ]) {
    const s = state([row('aaaa', patch)]);
    const p = planReplaceAll(s, request(s));
    assert.equal(p.matchCount, 2);
    assert.equal(p.executionAuthority, false);
  }
  const s = state([row('aa', { currentReference: undefined })], { format: 'hwpx' });
  assert.equal(planReplaceAll(s, request(s)).edits[0].source.reference, undefined);
});
test('full HWP5 current-reference schema reuses canonical helper and never falls back to ordinals', () => {
  for (const change of [
    { epoch: '0' },
    { scope: '' },
    { kind: 'cell' },
    { section: 1 },
    { id: '01' },
    { id: '4294967296' },
    { row: 1 },
    { extra: true },
  ]) {
    const s = state([row('aaaa', { currentReference: { ...reference, ...change } })]);
    assert.throws(() => planReplaceAll(s, request(s)), /UnsupportedReplaceAllReference/);
  }
});
test('source offset mapping uses current ordinals and refuses protected gaps, malformed tables and overflow', () => {
  const s = state([
    row('x a x a', {
      sourceOffsets: [
        { at: 0, source: 0 },
        { at: 2, source: 9 },
      ],
    }),
  ]);
  const p = planReplaceAll(s, request(s, { query: 'a' }));
  assert.deepEqual(
    p.edits.map((e) => [e.source.startUnit, e.source.endUnit]),
    [
      [9, 10],
      [13, 14],
    ],
  );
  for (const offsets of [
    [
      { at: 0, source: 0 },
      { at: 1, source: 8 },
    ],
    [
      { at: 0, source: 0 },
      { at: 0, source: 1 },
    ],
    [{ at: 0, source: 1 }],
    [
      { at: 0, source: 0 },
      { at: 1, source: 0xffffffff },
    ],
  ]) {
    const invalid = state([row('aaaa', { sourceOffsets: offsets })]);
    assert.throws(
      () => planReplaceAll(invalid, request(invalid)),
      /ProtectedAnchorRange|InvalidDisplayPosition/,
    );
  }
});
test('strict request/limit/token/schema rejection, malformed Unicode and stale layout/selection fences', () => {
  const s = state();
  for (const patch of [
    { schemaVersion: 2 },
    { extra: true },
    { query: '' },
    { query: '\ud800' },
    { replacement: '\udc00' },
    { layoutToken: { ...s.token, extra: true } },
    { layoutToken: { ...s.token, viewRevision: 2 } },
    { stateVersion: 3 },
    { limits: { matches: 4097 } },
    { limits: { matches: 1.5 } },
    { limits: { matches: Number.MAX_SAFE_INTEGER } },
    { limits: { extra: 1 } },
  ])
    assert.throws(() => planReplaceAll(s, request(s, patch)));
  for (const key of Object.keys(request(s))) {
    const missing: any = request(s);
    delete missing[key];
    assert.throws(() => planReplaceAll(s, missing));
  }
  const accessor = Object.defineProperty(request(s), 'query', {
    get() {
      throw Error('GetterExecuted');
    },
  });
  assert.throws(() => planReplaceAll(s, accessor), /AccessorPayloadUnsupported/);
  for (const limits of [
    { matches: 1 },
    { snapshotUnits: 3 },
    { insertedUnits: 1 },
    { insertedBytes: 1 },
    { outputUnits: 1 },
    { paragraphs: 0 },
    { replacementUnits: 0 },
    { queryUnits: 1 },
  ])
    assert.throws(() => planReplaceAll(s, request(s, { limits })), /ReplaceAllPlanLimitExceeded/);
});
test('emoji, combining scalar policy and replacement expansion remain snapshot literal', () => {
  const s = state([row('😀😀e\u0301')]);
  const p = planReplaceAll(s, request(s, { query: '😀', replacement: '😀😀' }));
  assert.deepEqual(
    p.edits.map((e) => [e.target.startUnit, e.target.endUnit]),
    [
      [0, 2],
      [2, 4],
    ],
  );
  assert.equal(p.totals.insertedBytes, 16);
  assert.equal(planReplaceAll(s, request(s, { query: 'e', replacement: '' })).matchCount, 1);
  const repeated = state([row('aaa')]);
  assert.equal(
    planReplaceAll(repeated, request(repeated, { query: 'a', replacement: 'aa' })).matchCount,
    3,
  );
});
test('many mutable external rows are owned once and do not fall back to per-match full-array scans', () => {
  const rows = Array.from({ length: 512 }, (_, paragraph) => row('aaaa', { paragraph }));
  let filters = 0;
  Object.defineProperty(rows, 'filter', {
    value() {
      filters++;
      throw Error('ExternalFilter');
    },
  });
  const external = {
    ...token,
    token,
    status: 'ready',
    stateVersion: 4,
    content: { format: 'hwp5', paragraphs: rows, totalParagraphs: rows.length },
  } as any;
  const p = planReplaceAll(external, request(external));
  assert.equal(p.matchCount, 1024);
  assert.equal(filters, 0);
});

test('Native revision and malformed permission observations never enter a plan', () => {
  for (const revision of [-1, 1.5, 0x100000000]) {
    const s = state(undefined, {}, { nativeHistoryRevision: revision });
    assert.throws(() => planReplaceAll(s, request(s)), /InvalidDocumentTextSnapshot/);
  }
  const s = state([row('aa', { editable: 1 })]);
  assert.throws(() => planReplaceAll(s, request(s)), /SelectionNotEditable/);
});
test('multi-section plans keep immutable canonical targets and count all rows exactly once', () => {
  const s = state([
    row('aa'),
    row('aa', {
      section: 2,
      paragraph: 8,
      selectionOwner: 'section:2:body',
      currentReference: { ...reference, section: 2, id: '456' },
    }),
  ]);
  const p = planReplaceAll(s, request(s));
  assert.deepEqual(
    p.edits.map((e) => [e.target.section, e.target.paragraph]),
    [
      [0, 0],
      [2, 8],
    ],
  );
  assert.deepEqual(plain(p.coverage.sections), [
    { section: 0, observedParagraphs: 1 },
    { section: 2, observedParagraphs: 1 },
  ]);
  assert.equal(p.coverage.nativeVerified, false);
});
test('field owners without hits are not hidden exclusions, and readonly equal-text matches still reject', () => {
  const s = state([row(), row('other', { paragraph: 1, editable: false, fieldLabels: [{}] })]);
  assert.equal(planReplaceAll(s, request(s)).matchCount, 2);
  const readOnly = state(undefined, { readOnly: true });
  assert.throws(
    () => planReplaceAll(readOnly, request(readOnly, { replacement: 'aa' })),
    /ReadOnlyDocument/,
  );
});

test('actual full-plan row validation and existing canonical index each traverse P once, not K*P', () => {
  const receipts = [];
  for (const n of [32, 64, 128]) {
    const s = state(Array.from({ length: n }, (_, paragraph) => row('aaaa', { paragraph })));
    const paragraphs = (s.content as any).paragraphs;
    const originalFilter = Array.prototype.filter;
    const originalDescriptor = Object.getOwnPropertyDescriptor;
    let rowVisits = 0,
      indexSlotReads = 0;
    let p;
    try {
      Array.prototype.filter = function (callback: any, thisArg: any) {
        if (this !== paragraphs) return originalFilter.call(this, callback, thisArg);
        return originalFilter.call(this, (value: any, i: number, array: any) => {
          rowVisits++;
          return callback.call(thisArg, value, i, array);
        });
      } as any;
      Object.getOwnPropertyDescriptor = ((object: any, key: any) => {
        if (object === paragraphs && /^(0|[1-9][0-9]*)$/.test(String(key))) indexSlotReads++;
        return originalDescriptor(object, key);
      }) as any;
      p = planReplaceAll(s, request(s));
    } finally {
      Array.prototype.filter = originalFilter;
      Object.getOwnPropertyDescriptor = originalDescriptor;
    }
    assert.equal(p!.matchCount, n * 2);
    assert.equal(rowVisits, n);
    assert.equal(indexSlotReads, n);
    receipts.push({ paragraphs: n, matches: p!.matchCount, rowVisits, indexSlotReads });
  }
  console.log(JSON.stringify({ scope: 'actual-full-plan-row-work-only', receipts }));
});
