import test from 'node:test';
import assert from 'node:assert/strict';
import { ownObservation } from '../../src/state/owned.ts';
import {
  isPlainOwnerBaseline,
  mergeExclusiveOwnerWindow,
} from '../../src/internal/owner-window-cow.ts';
import { validateFullSnapshotTextDelta } from '../../src/internal/full-snapshot-text-delta.ts';

// Synthetic contract fixtures only; these do not grant or register Native authority.
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
  return { before, packet, merge };
}
for (const available of [false, true])
  test(`source grid capability ${available} preserves COW and stable header identity`, () => {
    const f = fixture({ sourceTableGridAvailable: available });
    assert.equal(isPlainOwnerBaseline(f.before, 0, 0), true);
    const next = f.merge();
    assert(next, 'EligibleBooleanCapabilityMustKeepCOW');
    assert.equal(next.sourceTableGridAvailable, available);
    assert.equal(
      next.characterShapes,
      f.before.characterShapes,
      'COW keeps stable header identity',
    );
    assert.equal(next.currentParagraphFlows, f.before.currentParagraphFlows);
    assert.equal(next.paragraphs[0].text, 'ax');
    assert.equal(next.paragraphs[0].currentReference.epoch, '2');
    assert.equal(validateFullSnapshotTextDelta(f.before, next, f.packet), true);
  });
test('older snapshots without optional source capability remain eligible', () => {
  const f = fixture();
  assert.equal(isPlainOwnerBaseline(f.before, 0, 0), true);
  const next = f.merge();
  assert(next);
  assert.equal(Object.hasOwn(next, 'sourceTableGridAvailable'), false);
});
test('source capability admits only actual boolean values, never truthiness or coercion', () => {
  for (const value of [undefined, null, 0, 1, 'false', 'true', {}, []]) {
    const f = fixture({ sourceTableGridAvailable: value });
    assert.equal(isPlainOwnerBaseline(f.before, 0, 0), false);
    assert.equal(f.merge(), null);
  }
});
test('capability changes, removal, addition and type changes still invalidate exact full snapshot reuse', () => {
  for (const available of [false, true]) {
    const f = fixture({ sourceTableGridAvailable: available }),
      next = f.merge();
    assert(next);
    for (const value of [!available, undefined, null, Number(available), String(available), {}])
      assert.equal(
        validateFullSnapshotTextDelta(
          f.before,
          ownObservation({ ...next, sourceTableGridAvailable: value })(),
          f.packet,
        ),
        false,
      );
    const removed = { ...next };
    delete removed.sourceTableGridAvailable;
    assert.equal(
      validateFullSnapshotTextDelta(f.before, ownObservation(removed)(), f.packet),
      false,
    );
  }
  const f = fixture(),
    next = f.merge();
  assert(next);
  assert.equal(
    validateFullSnapshotTextDelta(
      f.before,
      ownObservation({ ...next, sourceTableGridAvailable: false })(),
      f.packet,
    ),
    false,
  );
});
test('unknown dangerous root fields still refuse COW even when both snapshots agree', () => {
  for (const extra of [
    { sourceTableGridAvailable: true, unknownDangerousField: true },
    { sourceTableGridAvailable: false, sourceTableGridRequest: { tableNode: 10 } },
    { sourceTableGridAvailable: true, sourceTableGridAvailableExtra: false },
  ]) {
    const f = fixture(extra);
    assert.equal(isPlainOwnerBaseline(f.before, 0, 0), false);
    assert.equal(f.merge(), null);
  }
});
