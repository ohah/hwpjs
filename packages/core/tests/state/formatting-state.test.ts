import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../src/state/editor-state.ts';
import { getSelectionFormatting } from '../../src/state/formatting-state.ts';
const token = {
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 2,
  viewRevision: 3,
};
const target = {
  ...token,
  format: 'hwp5',
  coordinateSpace: 'display',
  owner: 'section:0:body',
  section: 0,
  paragraph: 0,
  startUnit: 0,
  endUnit: 2,
  affinity: 'forward',
};
function snapshot(selection: any = target, row: any = {}, content: any = {}, extra: any = {}) {
  return new EditorState({
    ...token,
    status: 'ready',
    stateVersion: 1,
    selection,
    content: {
      format: 'hwp5',
      characterPropertiesAvailable: true,
      paragraphAlignmentAvailable: true,
      characterShapes: [
        { id: 0, bold: true, italic: false, height: 1000 },
        { id: 1, bold: false, italic: false, height: 2000 },
      ],
      paragraphs: [
        {
          section: 0,
          paragraph: 0,
          text: 'AB',
          editable: true,
          selectionOwner: 'section:0:body',
          currentReference: { kind: 'original', section: 0, id: '99' },
          characterRanges: [
            { start: 0, end: 1, charShapeId: 0 },
            { start: 1, end: 2, charShapeId: 1 },
          ],
          paragraphShape: { alignment: 3 },
          ...row,
        },
      ],
      ...content,
    },
    ...extra,
  });
}
test('canonical mixed values, immutable owned target and no write/readback dependencies', () => {
  const s = snapshot();
  const f = getSelectionFormatting(s);
  assert.equal(f.bold, 'mixed');
  assert.equal(f.italic, false);
  assert.equal(f.size, 'mixed');
  assert.equal(f.align, 'CENTER');
  assert.equal(f.characterAvailableReason, null);
  assert.equal(f.paragraphAvailableReason, null);
  assert(Object.isFrozen(f));
  assert(Object.isFrozen(f.target));
  assert.notEqual(f.target, target);
  assert.equal(getSelectionFormatting(snapshot({ ...target, endUnit: 1 })).size, 1000);
});
test('missing, dangling and stale selection never synthesize targets', () => {
  for (const [selection, reason] of [
    [null, 'MissingSelection'],
    [{ ...target, paragraph: 99 }, 'InvalidSelectionOwner'],
    [{ ...target, operationRevision: 1 }, 'StaleTarget'],
    [{ ...target, viewRevision: 1 }, 'StaleTarget'],
  ]) {
    const f = getSelectionFormatting(snapshot(selection));
    assert.equal(f.target, null);
    assert.equal(f.characterAvailableReason, reason);
    assert.equal(f.paragraphAvailableReason, reason);
  }
  assert.equal(
    getSelectionFormatting(snapshot(target, {}, {}, { status: 'refresh-required' }))
      .characterAvailableReason,
    'RefreshRequired',
  );
});
test('collapsed, created, unknown binding/capability and missing shape have explicit observations', () => {
  const collapsed = getSelectionFormatting(snapshot({ ...target, endUnit: 0 }));
  assert.equal(collapsed.characterAvailableReason, 'EmptyCharacterSelection');
  assert.equal(collapsed.paragraphAvailableReason, null);
  assert.equal(collapsed.align, 'CENTER');
  for (const [row, reason] of [
    [{ createdCell: {} }, 'CreatedCellRequiresSurfacePort'],
    [{ currentReference: undefined }, 'UnsupportedFormattingReference'],
    [
      { currentReference: { kind: 'generated', section: 0, id: '1' } },
      'UnsupportedFormattingReference',
    ],
  ]) {
    const f = getSelectionFormatting(snapshot(target, row));
    assert.equal(f.characterAvailableReason, reason);
    assert.equal(f.paragraphAvailableReason, reason);
  }
  const unknown = getSelectionFormatting(
    snapshot(
      target,
      {},
      { characterPropertiesAvailable: 'true', paragraphAlignmentAvailable: undefined },
    ),
  );
  assert.equal(unknown.characterAvailableReason, 'FormattingCapabilityUnavailable');
  assert.equal(unknown.paragraphAvailableReason, 'FormattingCapabilityUnavailable');
  const missing = getSelectionFormatting(
    snapshot(target, { paragraphShape: { alignment: 99 } }, { characterShapes: [] }),
  );
  assert.equal(missing.bold, null);
  assert.equal(missing.size, null);
  assert.equal(missing.align, null);
});
test('protected-anchor selection retains readonly source values while character writes remain denied', () => {
  const f = getSelectionFormatting(
    snapshot(target, {
      sourceOffsets: [
        { at: 0, source: 0 },
        { at: 1, source: 8 },
      ],
    }),
  );
  assert.equal(f.characterAvailableReason, 'ProtectedAnchorRange');
  assert.equal(f.bold, 'mixed');
  assert.equal(f.size, 'mixed');
  assert.equal(f.paragraphAvailableReason, null);
  assert.equal(f.align, 'CENTER');
});
test('original table cells use their canonical list owner; stale and foreign owners stay unavailable', () => {
  const cell = {
    selectionOwner: null,
    tableCell: { tableNode: 7, listNode: 8, row: 0, column: 0 },
  };
  const selected = { ...target, owner: 'section:0:table:7:list:8' };
  const observed = getSelectionFormatting(snapshot(selected, cell));
  assert.equal(observed.characterAvailableReason, null);
  assert.equal(observed.paragraphAvailableReason, null);
  assert.equal(observed.bold, 'mixed');
  assert.equal(observed.align, 'CENTER');
  for (const owner of ['section:0:body', 'section:0:table:7:list:9', 'section:0:table:9:list:8']) {
    const denied = getSelectionFormatting(snapshot({ ...selected, owner }, cell));
    assert.equal(denied.characterAvailableReason, 'InvalidSelectionOwner');
    assert.equal(denied.paragraphAvailableReason, 'InvalidSelectionOwner');
  }
  assert.equal(
    getSelectionFormatting(snapshot({ ...selected, viewRevision: 2 }, cell))
      .characterAvailableReason,
    'StaleTarget',
  );
  assert.equal(
    getSelectionFormatting(snapshot(selected, { ...cell, createdCell: {} }))
      .characterAvailableReason,
    'CreatedCellRequiresSurfacePort',
  );
  assert.equal(
    getSelectionFormatting(
      snapshot(selected, { ...cell, currentReference: { kind: 'generated', section: 0, id: '1' } }),
    ).characterAvailableReason,
    'UnsupportedFormattingReference',
  );
});

test('underline observes its own capability and current resource inventory independently of bold', () => {
  const inventories = {
    characterUnderlineAvailable: true,
    characterPropertiesAvailable: false,
    characterUnderlines: [
      { id: 0, kind: 'bottom' },
      { id: 1, kind: 'none' },
    ],
  };
  const mixed = getSelectionFormatting(snapshot(target, {}, inventories));
  assert.equal(mixed.underlineAvailableReason, null);
  assert.equal(mixed.underline, 'mixed');
  assert.equal(mixed.characterAvailableReason, 'FormattingCapabilityUnavailable');
  assert.equal(
    getSelectionFormatting(snapshot({ ...target, endUnit: 1 }, {}, inventories)).underline,
    true,
  );
  assert.equal(
    getSelectionFormatting(snapshot({ ...target, startUnit: 1 }, {}, inventories)).underline,
    false,
  );
  const missing = getSelectionFormatting(
    snapshot(target, {}, { ...inventories, characterUnderlines: [] }),
  );
  assert.equal(missing.underlineAvailableReason, null);
  assert.equal(missing.underline, null);
  const unavailable = getSelectionFormatting(
    snapshot(
      target,
      {},
      { ...inventories, characterUnderlineAvailable: false, characterPropertiesAvailable: true },
    ),
  );
  assert.equal(unavailable.underlineAvailableReason, 'FormattingCapabilityUnavailable');
  assert.equal(unavailable.underline, null);
  assert.equal(unavailable.bold, 'mixed');
  const collapsed = getSelectionFormatting(snapshot({ ...target, endUnit: 0 }, {}, inventories));
  assert.equal(collapsed.underlineAvailableReason, 'EmptyCharacterSelection');
  assert.equal(collapsed.underline, true);
});

test('complete generated body binding enables each advertised formatting capability', () => {
  const reference = {
    epoch: '4',
    scope: 'session:1',
    kind: 'generated',
    section: 0,
    id: '19',
    row: 0,
    column: 0,
  };
  const s = snapshot(
    target,
    { currentReference: reference },
    {
      characterUnderlineAvailable: true,
      characterStrikeAvailable: true,
      characterTextColorAvailable: true,
      characterFontNameAvailable: true,
      characterUnderlines: [
        { id: 0, kind: 'bottom' },
        { id: 1, kind: 'none' },
      ],
      characterStrikes: [
        { id: 0, enabled: true },
        { id: 1, enabled: false },
      ],
      characterTextColors: [
        { id: 0, color: 0x123456 },
        { id: 1, color: 0x123456 },
      ],
      fontFaces: ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'].map(
        (language) => ({ language, id: 0, name: 'Source Font' }),
      ),
      characterFontReferences: [
        { id: 0, fontIds: Array(7).fill(0) },
        { id: 1, fontIds: Array(7).fill(0) },
      ],
    },
  );
  const f = getSelectionFormatting(s);
  assert.equal(f.characterAvailableReason, null);
  assert.equal(f.paragraphAvailableReason, null);
  assert.equal(f.underlineAvailableReason, null);
  assert.equal(f.strikeAvailableReason, null);
  assert.equal(f.textColorAvailableReason, null);
  assert.equal(f.fontNameAvailableReasons.hangul, null);
  assert.equal(f.underline, 'mixed');
  assert.equal(f.strike, 'mixed');
  assert.equal(f.textColor, '#123456');
  assert.deepEqual(f.fontNames.hangul, { kind: 'single', name: 'Source Font' });
  const absent = getSelectionFormatting(snapshot(target, { currentReference: reference }));
  assert.equal(absent.underlineAvailableReason, 'FormattingCapabilityUnavailable');
  assert.equal(absent.strikeAvailableReason, 'FormattingCapabilityUnavailable');
  assert.equal(absent.textColorAvailableReason, 'FormattingCapabilityUnavailable');
  assert.equal(absent.fontNameAvailableReasons.hangul, 'FormattingCapabilityUnavailable');
  const caret = getSelectionFormatting(
    snapshot({ ...target, endUnit: 0 }, { currentReference: reference }, s.content),
  );
  assert.equal(caret.characterAvailableReason, 'EmptyCharacterSelection');
  assert.equal(caret.paragraphAvailableReason, null);
  assert.equal(caret.underlineAvailableReason, 'EmptyCharacterSelection');
  assert.equal(caret.strikeAvailableReason, 'EmptyCharacterSelection');
  assert.equal(caret.textColorAvailableReason, 'EmptyCharacterSelection');
  assert.equal(caret.fontNameAvailableReasons.hangul, 'EmptyCharacterSelection');
});
