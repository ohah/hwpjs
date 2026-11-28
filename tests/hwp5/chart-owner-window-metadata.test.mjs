import test from 'node:test';
import assert from 'node:assert/strict';
import { ownObservation } from '../../packages/core/src/state/owned.ts';
import { isPlainOwnerBaseline } from '../../packages/core/src/internal/owner-window-cow.ts';
import { EditorState } from '../../packages/core/src/state/editor-state.ts';
import { getInlineObjectInsertAvailability } from '../../packages/core/src/commands/inline-object-insert.ts';
import { attachHwp5Charts } from '../../web/preview/hwp5-chart-content.mjs';

// Synthetic schema and COW-consumer tests; no Native module, origin or lease is minted.
function baseline() {
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
  return {
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
        currentReference: {
          scope: 'scope',
          kind: 'original',
          epoch: '1',
          id: '10',
          section: 0,
          row: 0,
          column: 0,
        },
        characterRanges: [{ start: 0, end: 1, charShapeId: 0 }],
      },
    ],
  };
}
const eligible = (value) => isPlainOwnerBaseline(ownObservation(value)(), 0, 0);
const emptyDisplay = () => ({
  hwp5ChartDisplayAvailable: true,
  hwp5ChartTargets: [],
  hwp5ChartUnresolved: [],
  hwp5ChartSourceEpoch: '1',
  hwp5ChartHistoryRevision: 0,
});
test('old H5 chart-unavailable producer metadata preserves an otherwise plain COW baseline', () => {
  const plain = baseline();
  assert.equal(eligible(plain), true);
  const produced = attachHwp5Charts({ supportsHwp5ChartDisplayAbi: () => false }, plain);
  assert.equal(produced.hwp5ChartDisplayAvailable, false);
  assert.equal(eligible(produced), true);
});
test('unknown chart create profile metadata remains outside the H5 COW schema', () => {
  for (const extra of [
    { chartCreationAvailable: false, chartCreateProfileVersion: 0 },
    { chartCreationAvailable: true, chartCreateProfileVersion: 1 },
    { chartCreateProfileVersion: 1 },
    { chartCreationAvailable: 0, chartCreateProfileVersion: 0 },
    { chartCreationAvailable: true, chartCreateProfileVersion: 0 },
  ])
    assert.equal(eligible({ ...baseline(), ...extra }), false);
});
test('H5 chart boolean metadata reuse is distinct from actual creation admission', () => {
  const target = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
    coordinateSpace: 'display',
    format: 'hwp5',
    owner: 'section:0:body',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 0,
    affinity: 'forward',
  };
  const availability = (extra) =>
    getInlineObjectInsertAvailability(
      new EditorState({
        ...target,
        status: 'ready',
        stateVersion: 1,
        selection: target,
        nativeHistoryRevision: 0,
        nativeHistoryStats: { protocolVersion: 2 },
        content: {
          ...baseline(),
          paragraphs: baseline().paragraphs.map((row) => ({
            ...row,
            selectionOwner: 'section:0:body',
          })),
          ...extra,
        },
      }),
      'chart',
    );
  for (const value of [false, true]) {
    const extra = { chartCreationAvailable: value };
    assert.equal(eligible({ ...baseline(), ...extra }), true);
    assert.equal(availability(extra).enabled, false);
  }
  assert.deepEqual(availability({ chartCreationAvailable: true }), {
    enabled: false,
    reason: 'ChartCreateProfileUnavailable',
  });
  for (const profile of [undefined, null, 0, 5, true, '1'])
    assert.deepEqual(
      availability({ chartCreationAvailable: true, hwp5ChartCreateProfileVersion: profile }),
      {
        enabled: false,
        reason: 'ChartCreateProfileUnavailable',
      },
    );
  for (const profile of [1, 2, 3, 4])
    assert.deepEqual(
      availability({ chartCreationAvailable: true, hwp5ChartCreateProfileVersion: profile }),
      { enabled: true },
    );
  assert.equal(
    availability({ chartCreationAvailable: false, hwp5ChartCreateProfileVersion: 1 }).enabled,
    false,
  );
  assert.equal(
    availability({ chartCreationAvailable: true, hwp5ChartCreateProfileVersion: 1, readOnly: true })
      .enabled,
    false,
  );
});
test('chart read metadata preserves the current canonical created-cell typing scope guard', () => {
  assert.equal(
    eligible({ ...baseline(), ...emptyDisplay(), richTypingScope: 7, createdCellTypingScope: 7 }),
    true,
  );
  assert.equal(
    eligible({ ...baseline(), ...emptyDisplay(), richTypingScope: 7, createdCellTypingScope: 8 }),
    false,
  );
  assert.equal(
    eligible({ ...baseline(), ...emptyDisplay(), richTypingScope: 7, createdCellTypingScope: '7' }),
    false,
  );
});
test('empty H5 chart observations carry canonical read metadata without granting an object owner', () => {
  assert.equal(eligible({ ...baseline(), ...emptyDisplay() }), true);
  assert.equal(
    eligible({
      ...baseline(),
      ...emptyDisplay(),
      hwp5ChartSourceEpoch: '18446744073709551615',
      hwp5ChartHistoryRevision: null,
    }),
    true,
  );
  for (const epoch of ['0', '01', '-1', '1e2', '18446744073709551616', 1, null])
    assert.equal(
      eligible({ ...baseline(), ...emptyDisplay(), hwp5ChartSourceEpoch: epoch }),
      false,
    );
  for (const revision of [-1, -0, 0.5, '0', 0xffffffff])
    assert.equal(
      eligible({ ...baseline(), ...emptyDisplay(), hwp5ChartHistoryRevision: revision }),
      false,
    );
  assert.throws(
    () => ownObservation({ ...baseline(), ...emptyDisplay(), hwp5ChartHistoryRevision: NaN }),
    /InvalidNumber/,
  );
});
test('H5 chart objects unresolved data and errors remain excluded from plain COW', () => {
  for (const extra of [
    { hwp5ChartTargets: [{}] },
    { hwp5ChartUnresolved: [{}] },
    { hwp5ChartQueryError: 'SourceBindingMismatch' },
    { hwp5ChartQueryError: '' },
    { hwp5ChartQueryError: null },
  ])
    assert.equal(eligible({ ...baseline(), ...emptyDisplay(), ...extra }), false);
});
test('known H5 metadata never admits unknown keys paragraph authority or read-only content', () => {
  assert.equal(eligible({ ...baseline(), ...emptyDisplay(), unknownChartPermission: true }), false);
  assert.equal(eligible({ ...baseline(), ...emptyDisplay(), readOnly: true }), false);
  const value = { ...baseline(), ...emptyDisplay() };
  value.paragraphs[0].chartInlineAuthority = true;
  assert.equal(eligible(value), false);
});
test('H5 display metadata rejects malformed unavailable states and incomplete observations', () => {
  for (const extra of [
    { hwp5ChartDisplayAvailable: 'true' },
    { hwp5ChartTargets: null },
    { hwp5ChartUnresolved: {} },
    { hwp5ChartDisplayAvailable: false },
    { hwp5ChartSourceEpoch: undefined },
    { hwp5ChartHistoryRevision: undefined },
  ])
    assert.equal(eligible({ ...baseline(), ...emptyDisplay(), ...extra }), false);
  assert.equal(
    eligible({
      ...baseline(),
      hwp5ChartDisplayAvailable: false,
      hwp5ChartTargets: [],
      hwp5ChartUnresolved: [],
    }),
    true,
  );
});
