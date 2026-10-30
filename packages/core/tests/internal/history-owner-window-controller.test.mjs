import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeometryEvidenceController } from '../../src/internal/native-geometry-evidence.ts';
import { ownObservation } from '../../src/state/owned.ts';
import { isPlainOwnerBaseline } from '../../src/internal/owner-window-cow.ts';
// Pure controller contract fixtures. These are not actual Native/Worker authority receipts.
const owner = { section: 0, paragraph: 0, sourceNode: 10, parentNode: null };
const empty = [
  'createdTables',
  'hwp5Memos',
  'hwp5Notes',
  'hwp5NoteShapes',
  'hwp5NotePolicies',
  'hwp5Captions',
  'hwp5Forms',
  'hwp5DrawingBodies',
  'lines',
  'formulas',
  'drawings',
  'containers',
  'pageAreaSources',
  'masterPageSources',
  'hwp5PolygonPoints',
  'hwp5CurvePoints',
];
const reference = (epoch, id) => ({
  scope: 'scope',
  kind: 'original',
  epoch,
  id: String(id),
  section: 0,
  row: 0,
  column: 0,
});
function content(epoch, text) {
  return ownObservation({
    format: 'hwp5',
    readOnly: false,
    limited: false,
    totalParagraphs: 2,
    characterShapes: [{ id: 0 }, { id: 1 }],
    hwp5Drawings: [],
    ...Object.fromEntries(empty.map((k) => [k, []])),
    currentParagraphFlows: [0, 1].map((i) => ({
      section: 0,
      paragraph: i,
      source_node: 10 + i,
      parent_node: null,
      generated: false,
      host: 'body',
      memo_index: null,
      memo_node: null,
    })),
    paragraphs: [text, 'other'].map((text, i) => ({
      section: 0,
      paragraph: i,
      text,
      editable: true,
      automaticNumbers: [],
      automaticNumberPrefixes: [],
      pageControls: [],
      currentReference: reference(epoch, 10 + i),
      characterRanges: [{ start: 0, end: text.length, charShapeId: 0 }],
    })),
  })();
}
const ctx = (op) => ({
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  requestId: op + 1,
  operationRevision: op,
});
const state = (c, op, revision, ids = [0, 1]) => ({
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  status: 'ready',
  operationRevision: op,
  viewRevision: op,
  stateVersion: op + 1,
  content: c,
  nativeHistoryRevision: revision,
  nativeHistoryStats: { protocolVersion: 2 },
  nativeHistoryRevisions: ids,
});
function fixture() {
  const g = createGeometryEvidenceController();
  let active = true;
  const origin = (kind, op, epoch, revision, extra = {}) => ({
    kind,
    context: ctx(Math.max(0, op - 1)),
    sequence: op + 1,
    referenceScope: 'scope',
    nativeEpoch: epoch,
    nativeRevision: revision,
    owner: null,
    authority: () => active,
    ...extra,
  });
  const a = state(content('1', 'a'), 0, 0, [0]);
  g.publish(a, a, origin('full-baseline', 0, '1', 0));
  assert(g.read(a));
  const delta = ownObservation({
    receipt: {
      version: 1,
      exclusive: true,
      beforeEpoch: '1',
      epoch: '2',
      beforeRevision: 0,
      revision: 1,
      ...owner,
      startUnit: 1,
      removed: [],
      inserted: [120],
      totalUnits: 3,
      runs: [{ start_unit: 0, char_shape_id: 0 }],
    },
    before: { epoch: '1', section: 0, sourceNode: 10, parentNode: null, totalUnits: 2 },
    window: {
      epoch: '2',
      section: 0,
      sourceNode: 10,
      parentNode: null,
      startUnit: 0,
      endUnit: 3,
      totalUnits: 3,
      text: 'ax\r',
    },
    reference: reference('2', 10),
  })();
  const b = state(content('2', 'ax'), 1, 1);
  g.publish(
    a,
    b,
    origin('exclusive-text', 1, '2', 1, {
      beforeEpoch: '1',
      beforeRevision: 0,
      owner,
      fullSnapshotDelta: delta,
    }),
  );
  assert.equal(g.read(b)?.evidence.kind, 'exclusive-text');
  const capture = g.captureHistory(b, 'undo'),
    hint = g.historyWindowHint(b, capture);
  assert(hint);
  const packet = ownObservation({
    viewKind: 'history-owner-window',
    version: 1,
    operation: 'undo',
    beforeRevision: 1,
    revision: 0,
    beforeEpoch: '2',
    epoch: '3',
    owner,
    reference: reference('3', 10),
    window: {
      epoch: '3',
      section: 0,
      sourceNode: 10,
      parentNode: null,
      startUnit: 0,
      endUnit: 2,
      totalUnits: 2,
      text: 'a\r',
    },
    characterRanges: [{ start: 0, end: 1, charShapeId: 0 }],
  })();
  const o = origin('history-window', 2, '3', 0, {
    beforeEpoch: '2',
    beforeRevision: 1,
    owner,
    historyWindowDelta: packet,
  });
  return {
    g,
    a,
    b,
    capture,
    hint,
    packet,
    o,
    origin,
    disable() {
      active = false;
    },
  };
}
const ack = { historyStats: { protocolVersion: 2 }, historyRevisions: [0, 1] };
test('pure exact undo edge merges fresh window, retains resources; redo hint then works', () => {
  const f = fixture(),
    lease = f.g.read(f.b).evidence.resourceLease;
  const merged = f.g.mergeHistoryWindow(f.b, f.packet, f.o, f.capture, ack);
  assert(merged);
  assert.equal(merged.paragraphs[0].text, 'a');
  assert.equal(merged.characterShapes, f.b.content.characterShapes);
  assert.equal(merged.paragraphs[1].text, 'other');
  assert.equal(merged.paragraphs[1].currentReference.epoch, '3');
  const c = state(merged, 2, 0);
  f.g.publish(f.b, c, f.o, { kind: 'undo', capture: f.capture });
  assert.equal(f.g.read(c).evidence.kind, 'history-text');
  assert.equal(f.g.read(c).evidence.resourceLease, lease);
  const cap = f.g.captureHistory(c, 'redo');
  assert.equal(f.g.historyWindowHint(c, cap).expectedRevision, 1);
  assert.equal(
    f.g.mergeHistoryWindow(f.b, f.packet, f.o, f.capture, ack),
    null,
    'capture is single-use',
  );
});
for (const reason of ['load-ABA', 'dispose', 'formatting', 'unknown-mutation'])
  test(`pure ${reason} reset drops old hint and delayed ACK`, () => {
    const f = fixture();
    f.g.invalidate();
    assert.equal(f.g.historyWindowHint(f.b, f.capture), undefined);
    assert.equal(f.g.mergeHistoryWindow(f.b, f.packet, f.o, f.capture, ack), null);
  });
for (const [label, change] of [
  ['wrong-revision', (o) => (o.nativeRevision = 9)],
  ['wrong-before-epoch', (o) => (o.beforeEpoch = '1')],
  ['wrong-scope', (o) => (o.referenceScope = 'different')],
  ['wrong-generation', (o) => (o.context = { ...o.context, generation: 2 })],
  ['wrong-request-operation', (o) => (o.context = { ...o.context, operationRevision: 0 })],
  ['late-sequence', (o) => (o.sequence = 9)],
  ['custom-authority', (o) => (o.authority = () => false)],
])
  test(`pure history ACK ${label} falls back`, () => {
    const f = fixture();
    change(f.o);
    assert.equal(f.g.mergeHistoryWindow(f.b, f.packet, f.o, f.capture, ack), null);
  });
for (const [label, change] of [
  ['owner-parent', (p) => (p.owner.parentNode = 99)],
  ['window-source', (p) => (p.window.sourceNode = 99)],
  ['window-epoch', (p) => (p.window.epoch = '999')],
  ['window-CR', (p) => (p.window.text = 'ab')],
  ['window-length', (p) => (p.window.endUnit = 1)],
  ['window-opaque', (p) => (p.window.text = '\ufffc\r')],
  ['range-gap', (p) => (p.characterRanges[0].start = 1)],
  ['range-unknown-resource', (p) => (p.characterRanges[0].charShapeId = 99)],
  ['wrong-direction', (p) => (p.operation = 'redo')],
])
  test(`pure packet ${label} is rejected`, () => {
    const f = fixture(),
      raw = structuredClone(f.packet);
    change(raw);
    const p = ownObservation(raw)(),
      o = { ...f.o, historyWindowDelta: p };
    assert.equal(f.g.mergeHistoryWindow(f.b, p, o, f.capture, ack), null);
  });
test('pure terminal CR affinity is preserved exactly', () => {
  const f = fixture();
  const raw = structuredClone(f.packet);
  raw.characterRanges.push({ start: 1, end: 1, charShapeId: 1 });
  const p = ownObservation(raw)(),
    o = { ...f.o, historyWindowDelta: p };
  const m = f.g.mergeHistoryWindow(f.b, p, o, f.capture, ack);
  assert.deepEqual(
    JSON.parse(JSON.stringify(m.paragraphs[0].characterRanges)),
    raw.characterRanges,
  );
});
test('pure opaque/format-dependent baseline excludes projection', () => {
  const f = fixture();
  const raw = structuredClone(f.b.content);
  raw.paragraphs[0].text = '\ufffc';
  assert.equal(isPlainOwnerBaseline(ownObservation(raw)(), 0, 0), false);
  raw.paragraphs[0].text = 'ax';
  raw.formulas = [{}];
  assert.equal(isPlainOwnerBaseline(ownObservation(raw)(), 0, 0), false);
});
test('pure missing/unreachable ACK IDs reject merge', () => {
  for (const bad of [{}, { historyStats: { protocolVersion: 2 }, historyRevisions: [0] }]) {
    const f = fixture();
    assert.equal(f.g.mergeHistoryWindow(f.b, f.packet, f.o, f.capture, bad), null);
  }
});
test('pure raw full history stays raw full-baseline origin and uses existing full comparison', () => {
  const f = fixture(),
    raw = f.origin('full-baseline', 2, '3', 0);
  const c = state(content('3', 'a'), 2, 0);
  f.g.publish(f.b, c, raw, { kind: 'undo', capture: f.capture });
  assert.equal(raw.kind, 'full-baseline');
  assert.equal(f.g.read(c).evidence.kind, 'history-text');
});

test('round3 reentrant external owner cannot enter owned history COW', () => {
  const f = fixture();
  let reads = 0;
  const p = new Proxy(f.packet, {
      get(t, k) {
        if (k === 'owner') {
          reads++;
          f.g.invalidate();
        }
        return Reflect.get(t, k);
      },
    }),
    o = { ...f.o, historyWindowDelta: p };
  assert.equal(f.g.mergeHistoryWindow(f.b, p, o, f.capture, ack), null);
  assert.equal(reads, 0);
  assert.equal(f.g.read(f.b), undefined);
});
test('round4 outdated target metadata with same current revision is not an edge', () => {
  const f = fixture(),
    p = ownObservation({ ...f.packet, revision: 9 })(),
    o = { ...f.o, nativeRevision: 9, historyWindowDelta: p };
  assert.equal(f.g.mergeHistoryWindow(f.b, p, o, f.capture, ack), null);
});
test('round4 ACK lease/context cannot be replayed across controller', () => {
  const a = fixture(),
    b = fixture();
  assert.equal(b.g.historyWindowHint(b.b, a.capture), undefined);
  assert.equal(b.g.mergeHistoryWindow(b.b, a.packet, a.o, a.capture, ack), null);
});
test('round5 delayed successful merge cannot publish after lifecycle reset', () => {
  const f = fixture(),
    m = f.g.mergeHistoryWindow(f.b, f.packet, f.o, f.capture, ack);
  assert(m);
  f.g.invalidate();
  const next = state(m, 2, 0);
  f.g.publish(f.b, next, f.o, { kind: 'undo', capture: f.capture });
  assert.equal(f.g.read(next), undefined);
});
test('round5 authority callback reset during merge cannot return reusable content', () => {
  const f = fixture();
  let calls = 0;
  const o = {
    ...f.o,
    authority() {
      calls++;
      if (calls === 3) f.g.invalidate();
      return true;
    },
  };
  assert.equal(f.g.mergeHistoryWindow(f.b, f.packet, o, f.capture, ack), null);
  assert.equal(f.g.read(f.b), undefined);
});
