import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, createParagraphSelection, getSelectionFormatting } from '@hwpjs/core';
import { createFormattingBridge } from '../src/formatting-bridge.ts';
import { captureFormattingPresentation } from '../src/surface-formatting-capture.ts';
const languages = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'];
async function setup() {
  const content = {
    format: 'hwp5',
    characterPropertiesAvailable: true,
    characterFontNameAvailable: true,
    paragraphAlignmentAvailable: true,
    characterShapes: [{ id: 0, height: 1500, bold: true, italic: false }],
    characterFontReferences: [{ id: 0, fontIds: languages.map(() => 0) }],
    fontFaces: languages.map((language) => ({ language, id: 0, name: '문서원본' })),
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'AB',
        editable: true,
        selectionOwner: 'section:0:body',
        currentReference: { kind: 'original', section: 0, id: '0' },
        characterRanges: [{ start: 0, end: 2, charShapeId: 0 }],
      },
    ],
  };
  const requests = [];
  const editor = createEditor({
    runtimeFactory: () => ({
      async request(m) {
        requests.push(m);
        return { kind: m.kind, content, meta: { application: 'unapplied', changed: false } };
      },
      dispose() {},
    }),
  });
  await editor.load(new Uint8Array([1]), { format: 'hwp5' });
  await editor.setSelection(
    createParagraphSelection(editor.getEditorState(), {
      section: 0,
      paragraph: 0,
      startUnit: 1,
      endUnit: 1,
    }),
  );
  return { editor, requests };
}
test('genuine public caret target and zero-length mutation guard remain unchanged', async () => {
  const { editor } = await setup();
  try {
    const f = getSelectionFormatting(editor.getEditorState());
    assert.equal(f.target.startUnit, 1);
    assert.equal(f.target.endUnit, 1);
    assert.equal(f.characterAvailableReason, 'EmptyCharacterSelection');
  } finally {
    await editor.dispose();
  }
});
test('owned caret observation must reach toolbar without fabricating a nonempty Core target', async () => {
  const { editor } = await setup();
  let calls = 0;
  const state = editor.getEditorState();
  const base = getSelectionFormatting(state);
  const host = {
    captureCaretFormatting() {
      calls++;
      return {
        state,
        mode: 'typing',
        observation: {
          size: 1500,
          bold: true,
          italic: false,
          underline: false,
          strike: false,
          textColor: '#123456',
          fontNames: Object.fromEntries(
            languages.map((k) => [k, { kind: 'single', name: '문서원본' }]),
          ),
          align: null,
        },
        reasons: {
          characterAvailableReason: null,
          underlineAvailableReason: 'CaretUnderlineUnsupported',
          strikeAvailableReason: 'CaretStrikeUnsupported',
          textColorAvailableReason: 'CaretColorUnsupported',
          fontNameAvailableReasons: base.fontNameAvailableReasons,
          paragraphAvailableReason: 'CaretParagraphUnsupported',
        },
        current: () => editor.getEditorState() === state,
        appliedCurrent: () => false,
        bindDialog: () => false,
        request: () => false,
      };
    },
  };
  try {
    const bridge = createFormattingBridge({
      editor,
      onStatus() {},
      getSurfaceFormattingHost: () => host,
    });
    const shared = captureFormattingPresentation(editor, () => host);
    const p = bridge.getPresentation(shared);
    assert.equal(p.fontSizePoints, 15);
    assert.equal(p.fontName, '문서원본');
    assert.equal(p.actions.bold.pressed, true);
    assert.equal(calls, 1);
    assert.equal(editor.getEditorState().selection.startUnit, 1);
    assert.equal(editor.getEditorState().selection.endUnit, 1);
  } finally {
    await editor.dispose();
  }
});
