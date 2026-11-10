import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../src/editor/create-editor.ts';
import { EditorState } from '../../src/state/editor-state.ts';
import { underlineMessage } from '../../src/commands/underline.ts';
import { strikeMessage } from '../../src/commands/strike.ts';
import { textColorMessage } from '../../src/commands/text-color.ts';
import { fontNameMessage } from '../../src/commands/font-name.ts';
import {
  SET_CHARACTER_UNDERLINE_COMMAND,
  SET_CHARACTER_STRIKE_COMMAND,
  SET_CHARACTER_TEXT_COLOR_COMMAND,
  SET_CHARACTER_FONT_NAME_COMMAND,
} from '../../src/commands/commands.ts';

const reference = {
  epoch: '7',
  scope: 'session:generated',
  kind: 'generated',
  section: 0,
  id: '2',
  row: 0,
  column: 0,
};
const token = {
  editorId: 'extended',
  documentId: 'hwp5',
  generation: 1,
  operationRevision: 5,
  viewRevision: 6,
};
const target = {
  ...token,
  coordinateSpace: 'display' as const,
  format: 'hwp5' as const,
  section: 0,
  paragraph: 3,
  owner: 'section:0:body',
  startUnit: 1,
  endUnit: 3,
  affinity: 'forward' as const,
};
const cases = [
  {
    kind: 'character-underline',
    capability: 'characterUnderlineAvailable',
    command: SET_CHARACTER_UNDERLINE_COMMAND,
    message: underlineMessage,
    payload: { kind: 'bottom' },
  },
  {
    kind: 'character-strike',
    capability: 'characterStrikeAvailable',
    command: SET_CHARACTER_STRIKE_COMMAND,
    message: strikeMessage,
    payload: { enabled: true },
  },
  {
    kind: 'character-text-color',
    capability: 'characterTextColorAvailable',
    command: SET_CHARACTER_TEXT_COLOR_COMMAND,
    message: textColorMessage,
    payload: { color: '#123456' },
  },
  {
    kind: 'character-font-name',
    capability: 'characterFontNameAvailable',
    command: SET_CHARACTER_FONT_NAME_COMMAND,
    message: fontNameMessage,
    payload: { language: 'hangul', name: 'New Font' },
  },
];
function content(rowPatch: any = {}, patch: any = {}) {
  return {
    format: 'hwp5',
    characterUnderlineAvailable: true,
    characterStrikeAvailable: true,
    characterTextColorAvailable: true,
    characterFontNameAvailable: true,
    characterTextColors: [{ id: 0, color: 0x000000 }],
    fontFaces: ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'].map(
      (language) => ({ language, id: 0, name: 'Source Font' }),
    ),
    characterFontReferences: [{ id: 0, fontIds: Array(7).fill(0) }],
    paragraphs: [
      {
        section: 0,
        paragraph: 3,
        text: 'A😀B',
        editable: true,
        selectionOwner: 'section:0:body',
        currentReference: reference,
        characterRanges: [{ start: 0, end: 4, charShapeId: 0 }],
        ...rowPatch,
      },
    ],
    ...patch,
  };
}
function state(row: any = {}, patch: any = {}) {
  return new EditorState({
    ...token,
    status: 'ready',
    stateVersion: 1,
    content: content(row, patch),
  });
}
function message(entry: (typeof cases)[number], s = state(), change: any = {}) {
  return (entry.message as any)({ target: { ...target, ...change }, ...entry.payload }, s);
}
for (const entry of cases) {
  test(`${entry.kind} generated BODY captures the complete owned binding with current ordinal`, async () => {
    const calls: any[] = [],
      snapshot = content();
    const editor = createEditor({
      runtimeFactory: () => ({
        dispose() {},
        async request(request: any) {
          calls.push(request);
          return {
            kind: request.kind,
            content: snapshot,
            ...(!['load', 'enable'].includes(request.kind)
              ? { meta: { application: 'applied', changed: true } }
              : {}),
          };
        },
      }),
    });
    try {
      await editor.load(new Uint8Array([1]), { format: 'hwp5' });
      const selected = { ...target, ...editor.getEditorState().token };
      const result = await editor.dispatchCommand(entry.command as any, {
        target: selected,
        ...entry.payload,
      });
      assert.equal(result.status, 'committed-with-snapshot', result.error);
      const request = calls.find((call) => call.kind === entry.kind);
      assert(request);
      assert.equal(request.paragraph, 3);
      assert.notEqual(request.paragraph, Number(reference.id));
      assert.deepEqual(request.reference, reference);
      assert.notEqual(request.reference, reference);
      assert.deepEqual(Object.keys(request.reference).sort(), Object.keys(reference).sort());
      assert.equal(request.startUnit, 1);
      assert.equal(request.endUnit, 3);
      const count = calls.length;
      assert.equal(
        (await editor.dispatchCommand(entry.command as any, { target: selected, ...entry.payload }))
          .error,
        'StaleTarget',
      );
      assert.equal(calls.length, count);
    } finally {
      await editor.dispose();
    }
  });
  test(`${entry.kind} generated admission preserves token, capability, range and owner checks`, () => {
    for (const change of [
      { operationRevision: 4 },
      { viewRevision: 5 },
      { generation: 2 },
      { documentId: 'other' },
      { editorId: 'other' },
    ])
      assert.throws(() => message(entry, state(), change), /StaleTarget/);
    for (const value of [false, undefined, 'true', 1])
      assert.throws(
        () => message(entry, state({}, { [entry.capability]: value })),
        /FormattingCapabilityUnavailable/,
      );
    assert.throws(() => message(entry, state(), { endUnit: 1 }), /EmptyCharacterSelection/);
    assert.throws(() => message(entry, state(), { startUnit: 2 }), /InvalidScalarBoundary/);
    assert.throws(() => message(entry, state(), { endUnit: 99 }), /InvalidTextPosition/);
    assert.throws(() => message(entry, state(), { owner: 'forged' }), /InvalidSelectionOwner/);
    assert.throws(
      () => message(entry, state({ createdCell: {} })),
      /CreatedCellRequiresSurfacePort/,
    );
    assert.throws(() => message(entry, state({ clipped: true })), /InvalidSelectionOwner/);
    assert.throws(() => message(entry, state({ editable: false })), /SelectionNotEditable/);
    for (const [field, value, owner] of [
      ['tableCell', { tableNode: 1, listNode: 2 }, 'section:0:table:1:list:2'],
      ['drawingText', { drawingNode: 1, listNode: 2 }, 'section:0:drawing:1:text:list:2'],
      ['drawingCaption', { drawingNode: 1, listNode: 2 }, 'section:0:drawing:1:caption:list:2'],
    ] as const)
      assert.throws(
        () => message(entry, state({ [field]: value, selectionOwner: null }), { owner }),
        /UnsupportedFormattingOwner/,
      );
  });
  test(`${entry.kind} malformed generated references never fall back to ordinals`, () => {
    for (const change of [
      { epoch: '0' },
      { epoch: '01' },
      { epoch: '18446744073709551616' },
      { scope: '' },
      { section: 1 },
      { id: '0' },
      { id: '01' },
      { id: '4294967296' },
      { row: 1 },
      { column: 1 },
      { extra: true },
    ])
      assert.throws(
        () => message(entry, state({ currentReference: { ...reference, ...change } })),
        /UnsupportedFormattingReference/,
      );
    for (const key of Object.keys(reference)) {
      const missing: any = { ...reference };
      delete missing[key];
      assert.throws(
        () => message(entry, state({ currentReference: missing })),
        /UnsupportedFormattingReference/,
      );
    }
    // Pass a plain state view to avoid any observation copier evaluating getters.
    const descriptor = { ...reference };
    Object.defineProperty(descriptor, 'id', {
      enumerable: true,
      get() {
        throw Error('AccessorExecuted');
      },
    });
    assert.throws(
      () => message(entry, { ...token, content: content({ currentReference: descriptor }) } as any),
      /UnsupportedFormattingReference/,
    );
  });
  test(`${entry.kind} preserves source offset mapping, original ordinal and HWPX admission`, () => {
    const mapped = message(
      entry,
      state({
        sourceOffsets: [
          { at: 0, source: 0 },
          { at: 1, source: 8 },
        ],
      }),
    );
    assert.equal(mapped.startUnit, 8);
    assert.equal(mapped.endUnit, 10);
    assert.deepEqual(mapped.reference, reference);
    assert.throws(
      () =>
        message(
          entry,
          state({
            sourceOffsets: [
              { at: 0, source: 0 },
              { at: 2, source: 8 },
            ],
          }),
          { startUnit: 0, endUnit: 3 },
        ),
      /ProtectedAnchorRange/,
    );
    const original = message(
      entry,
      state({ currentReference: { kind: 'original', section: 0, id: '99' } }),
    );
    assert.equal(original.paragraph, 3);
    assert.equal(original.reference, undefined);
    const hwpx = message(entry, state({ currentReference: undefined }, { format: 'hwpx' }), {
      format: 'hwpx',
    });
    assert.equal(hwpx.paragraph, 3);
    assert.equal(hwpx.reference, undefined);
  });
}
test('generated color and named font still require current resource observations', () => {
  assert.throws(
    () => message(cases[2], state({}, { characterTextColors: [] })),
    /UnknownCharacterTextColor/,
  );
  assert.throws(
    () => message(cases[2], state({}, { characterTextColors: [{ id: 0, color: 'red' }] })),
    /UnknownCharacterTextColor/,
  );
  assert.throws(
    () => message(cases[3], state({}, { characterFontReferences: [] })),
    /UnknownCharacterFontName/,
  );
  assert.throws(() => message(cases[3], state({}, { fontFaces: [] })), /UnknownCharacterFontName/);
  assert.throws(
    () => message(cases[3], state({}, { fontFacesError: 'SnapshotFailure' })),
    /UnknownCharacterFontName/,
  );
});
