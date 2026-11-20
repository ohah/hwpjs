import test from 'node:test';
import assert from 'node:assert/strict';
import { ownObservation } from '../../packages/core/src/state/owned.ts';
import { mergeExclusiveOwnerWindow } from '../../packages/core/src/internal/owner-window-cow.ts';
import { mergeHistoryOwnerWindow } from '../../packages/core/src/internal/history-owner-window.ts';
import { validateFullSnapshotTextDelta } from '../../packages/core/src/internal/full-snapshot-text-delta.ts';
import { validateHistoryTextSnapshots } from '../../packages/core/src/internal/history-text-snapshot.ts';
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
const reference = (epoch) => ({
  scope: 'scope',
  kind: 'original',
  epoch,
  id: '10',
  section: 0,
  row: 0,
  column: 0,
});
function fixture(extra = {}) {
  const before = ownObservation({
    format: 'hwp5',
    readOnly: false,
    limited: false,
    totalParagraphs: 1,
    characterShapes: [{ id: 0, height: 1000, bold: false, italic: false }],
    hwp5Drawings: [],
    ...Object.fromEntries(empty.map((key) => [key, []])),
    currentParagraphFlows: [
      {
        section: 0,
        paragraph: 0,
        source_node: 10,
        parent_node: null,
        generated: false,
        host: 'body',
        memo_index: null,
        memo_node: null,
      },
    ],
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'a',
        editable: true,
        automaticNumbers: [],
        automaticNumberPrefixes: [],
        pageControls: [],
        currentReference: reference('1'),
        characterRanges: [{ start: 0, end: 1, charShapeId: 0 }],
      },
    ],
    ...extra,
  })();
  const packet = ownObservation({
    receipt: {
      version: 1,
      exclusive: true,
      beforeEpoch: '1',
      epoch: '2',
      beforeRevision: 0,
      revision: 1,
      section: 0,
      paragraph: 0,
      sourceNode: 10,
      parentNode: null,
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
    reference: reference('2'),
  })();
  const context = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    requestId: 2,
    operationRevision: 0,
  };
  const expected = { context, sequence: 2, revision: 0, epoch: '1', referenceScope: 'scope' };
  const origin = {
    kind: 'exclusive-text',
    authority: () => true,
    context,
    sequence: 2,
    beforeRevision: 0,
    beforeEpoch: '1',
    referenceScope: 'scope',
    nativeEpoch: '2',
    nativeRevision: 1,
    ownerWindowDelta: packet,
  };
  const merge = () => mergeExclusiveOwnerWindow({ content: before }, packet, origin, expected);
  return { before, packet, merge, origin, expected };
}

const chart = {
  hwp5ChartDisplayAvailable: true,
  hwp5ChartTargets: [],
  hwp5ChartUnresolved: [],
  hwp5ChartSourceEpoch: '1',
  hwp5ChartHistoryRevision: 0,
};
// Authored data fixtures only; these are not real Native origins or Worker evidence.
const make = (extra = {}) => fixture({ ...chart, ...extra });
test('exclusive COW updates root stamps from the validated Native edge and retains other headers', () => {
  const f = make(),
    next = f.merge();
  assert(next);
  assert.equal(next.hwp5ChartSourceEpoch, '2');
  assert.equal(next.hwp5ChartHistoryRevision, 1);
  assert.equal(next.paragraphs[0].currentReference.epoch, '2');
  assert.equal(next.characterShapes, f.before.characterShapes);
  assert.equal(next.hwp5ChartTargets, f.before.hwp5ChartTargets);
  assert(validateFullSnapshotTextDelta(f.before, next, f.packet));
});
test('full snapshot validator rejects stale chart stamps and every unrelated header change', () => {
  const f = make(),
    next = f.merge();
  assert(next);
  const stale = ownObservation({
    ...next,
    hwp5ChartSourceEpoch: '1',
    hwp5ChartHistoryRevision: 0,
  })();
  assert.equal(validateFullSnapshotTextDelta(f.before, stale, f.packet), false);
  for (const extra of [
    { unknownPermission: true },
    { chartCreationAvailable: false },
    { hwp5ChartHistoryRevision: 9 },
    { hwp5ChartSourceEpoch: '9' },
  ])
    assert.equal(
      validateFullSnapshotTextDelta(f.before, ownObservation({ ...next, ...extra })(), f.packet),
      false,
    );
});
for (const [name, extra] of [
  ['stale epoch', { hwp5ChartSourceEpoch: '9' }],
  ['stale revision', { hwp5ChartHistoryRevision: 9 }],
  ['missing epoch', { hwp5ChartSourceEpoch: undefined }],
  ['missing revision', { hwp5ChartHistoryRevision: undefined }],
  ['targets', { hwp5ChartTargets: [{ owner: 0 }] }],
  ['unresolved', { hwp5ChartUnresolved: [{ owner: 0 }] }],
  ['error', { hwp5ChartQueryError: 'unavailable' }],
  ['unknown', { unknownAuthority: true }],
  ['readonly', { readOnly: true }],
])
  test('plain chart COW refuses ' + name, () => {
    assert.equal(make(extra).merge(), null);
  });
test('exclusive chart projection does not accept forged origins or cross-owner packets', () => {
  for (const [field, value] of [
    ['nativeEpoch', '9'],
    ['nativeRevision', 9],
    ['beforeEpoch', '9'],
    ['beforeRevision', 9],
    ['sequence', 9],
    ['authority', () => false],
  ]) {
    const f = make();
    f.origin[field] = value;
    assert.equal(f.merge(), null, field);
  }
  const f = make();
  f.expected.context = { ...f.expected.context, documentId: 'foreign' };
  assert.equal(f.merge(), null);
});
function history(before, operation, beforeEpoch, epoch, beforeRevision, revision, text) {
  const owner = { section: 0, paragraph: 0, sourceNode: 10, parentNode: null };
  const packet = ownObservation({
    viewKind: 'history-owner-window',
    version: 1,
    operation,
    beforeEpoch,
    epoch,
    beforeRevision,
    revision,
    owner,
    reference: reference(epoch),
    window: {
      epoch,
      section: 0,
      sourceNode: 10,
      parentNode: null,
      startUnit: 0,
      endUnit: text.length + 1,
      totalUnits: text.length + 1,
      text: text + '\r',
    },
    characterRanges: [{ start: 0, end: text.length, charShapeId: 0 }],
  })();
  const origin = {
    kind: 'history-window',
    historyWindowDelta: packet,
    authority: () => true,
    nativeEpoch: epoch,
    nativeRevision: revision,
    beforeEpoch,
    beforeRevision,
  };
  const expected = {
    owner,
    epoch: beforeEpoch,
    revision: beforeRevision,
    nextRevision: revision,
    referenceScope: 'scope',
  };
  return {
    packet,
    origin,
    expected,
    merge: () => mergeHistoryOwnerWindow({ content: before }, packet, origin, expected),
  };
}
test('undo and redo keep chart stamps fresh without forcing history fallback', () => {
  const f = make(),
    typed = f.merge();
  assert(typed);
  const undo = history(typed, 'undo', '2', '3', 1, 0, 'a'),
    back = undo.merge();
  assert(back);
  assert.equal(back.hwp5ChartSourceEpoch, '3');
  assert.equal(back.hwp5ChartHistoryRevision, 0);
  assert(
    validateHistoryTextSnapshots(typed, back, undo.expected.owner, '2', '3', 'scope', {
      beforeRevision: 1,
      revision: 0,
    }),
  );
  assert.equal(
    validateHistoryTextSnapshots(typed, back, undo.expected.owner, '2', '3', 'scope'),
    false,
  );
  const redo = history(back, 'redo', '3', '4', 0, 1, 'ax'),
    again = redo.merge();
  assert(again);
  assert.equal(again.hwp5ChartSourceEpoch, '4');
  assert.equal(again.hwp5ChartHistoryRevision, 1);
  assert(
    validateHistoryTextSnapshots(back, again, redo.expected.owner, '3', '4', 'scope', {
      beforeRevision: 0,
      revision: 1,
    }),
  );
  const stale = ownObservation({
    ...back,
    hwp5ChartSourceEpoch: '2',
    hwp5ChartHistoryRevision: 1,
  })();
  assert.equal(
    validateHistoryTextSnapshots(typed, stale, undo.expected.owner, '2', '3', 'scope', {
      beforeRevision: 1,
      revision: 0,
    }),
    false,
  );
});
test('history projection rejects missing or mismatched before/current proof and foreign owner', () => {
  for (const [key, value] of [
    ['nativeEpoch', '9'],
    ['nativeRevision', 9],
    ['beforeEpoch', '9'],
    ['beforeRevision', 9],
    ['authority', () => false],
  ]) {
    const f = make(),
      typed = f.merge();
    assert(typed);
    const h = history(typed, 'undo', '2', '3', 1, 0, 'a');
    h.origin[key] = value;
    assert.equal(h.merge(), null, key);
  }
  const f = make(),
    typed = f.merge(),
    h = history(typed, 'undo', '2', '3', 1, 0, 'a');
  h.expected.owner = { ...h.expected.owner, paragraph: 1 };
  assert.equal(h.merge(), null);
});

test('history paths refuse stale or incomplete chart baselines and keep unrelated header equality', () => {
  const f = make(),
    typed = f.merge();
  assert(typed);
  for (const extra of [
    { hwp5ChartSourceEpoch: '9' },
    { hwp5ChartHistoryRevision: 9 },
    { hwp5ChartSourceEpoch: undefined },
    { hwp5ChartHistoryRevision: undefined },
    { hwp5ChartQueryError: 'unavailable' },
    { hwp5ChartTargets: [{ owner: 1 }] },
    { hwp5ChartUnresolved: [{ owner: 1 }] },
    { readOnly: true },
    { unknownAuthority: true },
  ]) {
    const stale = ownObservation({ ...typed, ...extra })();
    assert.equal(history(stale, 'undo', '2', '3', 1, 0, 'a').merge(), null);
  }
  const h = history(typed, 'undo', '2', '3', 1, 0, 'a'),
    back = h.merge();
  assert(back);
  for (const extra of [
    { unknownPermission: true },
    { hwp5ChartTargets: [{ owner: 1 }] },
    { hwp5ChartQueryError: 'unavailable' },
    { chartCreationAvailable: false },
  ])
    assert.equal(
      validateHistoryTextSnapshots(
        typed,
        ownObservation({ ...back, ...extra })(),
        h.expected.owner,
        '2',
        '3',
        'scope',
        { beforeRevision: 1, revision: 0 },
      ),
      false,
    );
  assert.equal(
    validateHistoryTextSnapshots(typed, back, h.expected.owner, '2', '3', 'scope', {
      beforeRevision: 9,
      revision: 0,
    }),
    false,
  );
});
