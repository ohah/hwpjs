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

// Source-only successor declarations. Not executed; actual Native/Worker content
// plus the complete current 40-test gate are required before accepting this delta.
test('created cell typing scope keeps legacy absence and explicit null without granting a generation', () => {
  for (const extra of [
    {},
    { createdCellTypingScope: null },
    { richTypingScope: 7, createdCellTypingScope: null },
  ]) {
    const f = fixture(extra);
    assert.equal(isPlainOwnerBaseline(f.before, 0, 0), true);
    const next = f.merge();
    assert(next);
    assert.equal(
      Object.hasOwn(next, 'createdCellTypingScope'),
      Object.hasOwn(extra, 'createdCellTypingScope'),
    );
    assert.equal(next.createdCellTypingScope, f.before.createdCellTypingScope);
    assert.equal(next.characterShapes, f.before.characterShapes);
    assert.equal(validateFullSnapshotTextDelta(f.before, next, f.packet), true);
  }
});
test('created cell typing scope matches the exact positive body load ticket without numeric coercion', () => {
  for (const scope of [1, 7, Number.MAX_SAFE_INTEGER]) {
    const f = fixture({ richTypingScope: scope, createdCellTypingScope: scope });
    assert.equal(isPlainOwnerBaseline(f.before, 0, 0), true);
    const next = f.merge();
    assert(next);
    assert.equal(next.createdCellTypingScope, scope);
    assert.equal(next.richTypingScope, scope);
    assert.equal(next.currentParagraphFlows, f.before.currentParagraphFlows);
  }
});
test('created cell typing scope rejects malformed values and different or missing body tickets', () => {
  const cases = [
    ...[undefined, false, true, 0, -0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '7', {}, []].map(
      (scope) => ({ richTypingScope: 7, createdCellTypingScope: scope }),
    ),
    ...[undefined, null, false, '7', 8, {}, []].map((scope) => ({
      richTypingScope: scope,
      createdCellTypingScope: 7,
    })),
  ];
  for (const extra of cases) {
    const f = fixture(extra);
    assert.equal(isPlainOwnerBaseline(f.before, 0, 0), false);
    assert.equal(f.merge(), null);
  }
  for (const scope of [NaN, Infinity, -Infinity]) {
    assert.throws(
      () => fixture({ richTypingScope: 7, createdCellTypingScope: scope }),
      /InvalidNumber/,
    );
  }
});
test('valid created cell typing scope cannot bypass pending-owner readonly or unknown-field guards', () => {
  for (const extra of [
    { createdTables: [{ identity: '1', cells: [] }] },
    { readOnly: true },
    { createdCellTypingScopeExtra: 7 },
    { unknownDangerousField: true },
  ]) {
    const f = fixture({ richTypingScope: 7, createdCellTypingScope: 7, ...extra });
    assert.equal(isPlainOwnerBaseline(f.before, 0, 0), false);
    assert.equal(f.merge(), null);
  }
});
test('created cell typing scope remains exact metadata across COW and full-snapshot delta validation', () => {
  for (const extra of [
    {},
    { createdCellTypingScope: null },
    { richTypingScope: 7, createdCellTypingScope: 7 },
  ]) {
    const f = fixture(extra),
      next = f.merge();
    assert(next);
    assert.equal(validateFullSnapshotTextDelta(f.before, next, f.packet), true);
    for (const value of [undefined, null, 8, '7', {}]) {
      if (Object.hasOwn(extra, 'createdCellTypingScope') && value === extra.createdCellTypingScope)
        continue;
      assert.equal(
        validateFullSnapshotTextDelta(
          f.before,
          ownObservation({ ...next, createdCellTypingScope: value })(),
          f.packet,
        ),
        false,
      );
    }
    if (Object.hasOwn(extra, 'createdCellTypingScope')) {
      const removed = { ...next };
      delete removed.createdCellTypingScope;
      assert.equal(
        validateFullSnapshotTextDelta(f.before, ownObservation(removed)(), f.packet),
        false,
      );
    }
  }
});

for (const key of [
  'imageInsertionAvailable',
  'equationInsertionAvailable',
  'chartCreationAvailable',
  'hwp5ChartLiteralEditAvailable',
  'strictMeasuredSaveAvailable',
]) {
  test(`typed producer capability ${key} retains COW without issuing authority`, () => {
    for (const value of [false, true]) {
      const f = fixture({ [key]: value });
      assert.equal(isPlainOwnerBaseline(f.before, 0, 0), true);
      const next = f.merge();
      assert(next);
      assert.equal(next[key], value);
      assert.equal(next.characterShapes, f.before.characterShapes);
      assert.equal(isPlainOwnerBaseline(Object.freeze({ ...f.before }), 0, 0), false);
    }
    assert.throws(() => fixture({ [key]: new Boolean(true) }), /UnsupportedPayload/);
    for (const value of [undefined, null, 0, 1, '', 'true', {}, []]) {
      const f = fixture({ [key]: value });
      assert.equal(isPlainOwnerBaseline(f.before, 0, 0), false);
      assert.equal(f.merge(), null);
    }
  });
}
test('HWP5 chart create profile is exactly unavailable0 or supported1, never arbitrary positive version', () => {
  for (const value of [NaN, Infinity])
    assert.throws(() => fixture({ hwp5ChartCreateProfileVersion: value }), /InvalidNumber/);
  for (const value of [0, 1]) {
    const f = fixture({ hwp5ChartCreateProfileVersion: value });
    assert.equal(isPlainOwnerBaseline(f.before, 0, 0), true);
    const next = f.merge();
    assert(next);
    assert.equal(next.hwp5ChartCreateProfileVersion, value);
  }
  for (const value of [undefined, null, false, true, -0, -1, 2, 1.5, '0', '1', {}, []]) {
    const f = fixture({ hwp5ChartCreateProfileVersion: value });
    assert.equal(isPlainOwnerBaseline(f.before, 0, 0), false);
    assert.equal(f.merge(), null);
  }
});
test('complete current producer capabilities preserve strict unknown-key and ownership refusal', () => {
  const keys = {
    imageInsertionAvailable: true,
    equationInsertionAvailable: true,
    hwp5ChartCreateProfileVersion: 1,
    chartCreationAvailable: false,
    hwp5ChartLiteralEditAvailable: true,
    strictMeasuredSaveAvailable: true,
  };
  const f = fixture(keys);
  assert.equal(isPlainOwnerBaseline(f.before, 0, 0), true);
  const next = f.merge();
  assert(next);
  for (const [key, value] of Object.entries(keys)) assert.equal(next[key], value);
  const unknown = fixture({ ...keys, futureInsertionCapability: true });
  assert.equal(isPlainOwnerBaseline(unknown.before, 0, 0), false);
  assert.equal(unknown.merge(), null);
});

test('chart literal capability is exact metadata, not independent edit authority', () => {
  for (const value of [false, true]) {
    const f = fixture({ hwp5ChartLiteralEditAvailable: value });
    const next = f.merge();
    assert(next);
    assert.equal(next.hwp5ChartLiteralEditAvailable, value);
    assert.equal(validateFullSnapshotTextDelta(f.before, next, f.packet), true);
    for (const changed of [!value, undefined, null, 0, 1, 'true', {}, []]) {
      assert.equal(
        validateFullSnapshotTextDelta(
          f.before,
          ownObservation({ ...next, hwp5ChartLiteralEditAvailable: changed })(),
          f.packet,
        ),
        false,
      );
    }
    const removed = { ...next };
    delete removed.hwp5ChartLiteralEditAvailable;
    assert.equal(
      validateFullSnapshotTextDelta(f.before, ownObservation(removed)(), f.packet),
      false,
    );
    for (const extra of [
      { readOnly: true },
      { futureInsertionCapability: true },
      { hwp5ChartLiteralEditAvailableExtra: true },
    ]) {
      const bad = fixture({ hwp5ChartLiteralEditAvailable: value, ...extra });
      assert.equal(isPlainOwnerBaseline(bad.before, 0, 0), false);
      assert.equal(bad.merge(), null);
    }
  }
  const f = fixture(),
    next = f.merge();
  assert(next);
  for (const value of [false, true])
    assert.equal(
      validateFullSnapshotTextDelta(
        f.before,
        ownObservation({ ...next, hwp5ChartLiteralEditAvailable: value })(),
        f.packet,
      ),
      false,
    );
});

test('image capability is exact metadata, not independent edit authority', () => {
  for (const value of [false, true]) {
    const f = fixture({ imageInsertionAvailable: value });
    const next = f.merge();
    assert(next);
    assert.equal(next.imageInsertionAvailable, value);
    assert.equal(validateFullSnapshotTextDelta(f.before, next, f.packet), true);
    for (const changed of [!value, undefined, null, 0, 1, 'true', {}, []]) {
      assert.equal(
        validateFullSnapshotTextDelta(
          f.before,
          ownObservation({ ...next, imageInsertionAvailable: changed })(),
          f.packet,
        ),
        false,
      );
    }
    const removed = { ...next };
    delete removed.imageInsertionAvailable;
    assert.equal(
      validateFullSnapshotTextDelta(f.before, ownObservation(removed)(), f.packet),
      false,
    );
    for (const extra of [
      { readOnly: true },
      { futureInsertionCapability: true },
      { imageInsertionAvailableExtra: true },
    ]) {
      const bad = fixture({ imageInsertionAvailable: value, ...extra });
      assert.equal(isPlainOwnerBaseline(bad.before, 0, 0), false);
      assert.equal(bad.merge(), null);
    }
  }
  const f = fixture(),
    next = f.merge();
  assert(next);
  for (const value of [false, true])
    assert.equal(
      validateFullSnapshotTextDelta(
        f.before,
        ownObservation({ ...next, imageInsertionAvailable: value })(),
        f.packet,
      ),
      false,
    );
});
