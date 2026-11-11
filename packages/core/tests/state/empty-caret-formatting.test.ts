import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../src/state/editor-state.ts';
import { getSelectionFormatting } from '../../src/state/formatting-state.ts';
// @ts-ignore Canonical language partitions have no ambient declaration.
import { FONT_LANGUAGES } from '../../../../js/font-face-identity.mjs';
const token = {
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 0,
  viewRevision: 0,
};
function state(row: any = {}, content: any = {}, extra: any = {}) {
  return new EditorState({
    ...token,
    status: 'ready',
    stateVersion: 1,
    selection: {
      ...token,
      format: 'hwp5',
      coordinateSpace: 'display',
      owner: 'section:0:body',
      section: 0,
      paragraph: 4,
      startUnit: 0,
      endUnit: 0,
      affinity: 'forward',
    },
    content: {
      format: 'hwp5',
      characterPropertiesAvailable: true,
      characterFontNameAvailable: true,
      characterShapes: [{ id: 1, height: 1000, bold: false, italic: true }],
      characterFontReferences: [{ id: 1, fontIds: [0, 0, 0, 0, 0, 0, 0] }],
      fontFaces: FONT_LANGUAGES.map((language: string) => ({
        language,
        id: 0,
        name: language === 'hangul' ? '바탕' : 'face-' + language,
      })),
      paragraphs: [
        {
          section: 0,
          paragraph: 4,
          text: '',
          editable: true,
          selectionOwner: 'section:0:body',
          currentReference: { kind: 'original', section: 0, id: '22' },
          characterRanges: [{ start: 0, end: 0, charShapeId: 1, insertion: true }],
          ...row,
        },
      ],
      ...content,
    },
    ...extra,
  });
}
test('Native-proven empty insertion exposes declared properties and each language without a range write', () => {
  const s = state(),
    f = getSelectionFormatting(s);
  assert.equal(f.size, 1000);
  assert.equal(f.bold, false);
  assert.equal(f.italic, true);
  assert.equal(f.characterAvailableReason, 'EmptyCharacterSelection');
  assert.deepEqual(f.fontNames.hangul, { kind: 'single', name: '바탕' });
  assert.deepEqual(f.fontNames.latin, { kind: 'single', name: 'face-latin' });
  assert.equal((s.content as any).paragraphs[0].text, '');
  assert(Object.isFrozen(f));
});
test('old/missing proof, damaged display and dangling declarations stay unknown', () => {
  for (const row of [
    { characterRanges: [{ start: 0, end: 0, charShapeId: 1 }] },
    { characterRanges: [{ start: 0, end: 0, charShapeId: 1, insertion: false }] },
    { clipped: true },
    { characterRangesError: 'MissingParagraphText' },
    { characterRanges: [] },
    { characterRanges: [{ start: 0, end: 0, charShapeId: 99, insertion: true }] },
    {
      characterRanges: [
        { start: 0, end: 0, charShapeId: 1, insertion: true },
        { start: 0, end: 0, charShapeId: 0, insertion: true },
      ],
    },
  ]) {
    const f = getSelectionFormatting(state(row));
    assert.equal(f.size, null);
    assert.deepEqual(f.fontNames.hangul, { kind: 'unknown' });
  }
  const stale = getSelectionFormatting(state({}, {}, { operationRevision: 2 }));
  assert.equal(stale.size, null);
  assert.equal(stale.target, null);
});
test('readonly observes source; absent capability/name and HWPX do not gain admission', () => {
  const f = getSelectionFormatting(state({ editable: false }, { readOnly: true }));
  assert.equal(f.size, 1000);
  assert.notEqual(f.characterAvailableReason, null);
  assert.deepEqual(f.fontNames.latin, { kind: 'single', name: 'face-latin' });
  assert.equal(
    getSelectionFormatting(state({}, { characterPropertiesAvailable: false })).size,
    null,
  );
  const missing = getSelectionFormatting(state({}, { fontFaces: [] }));
  assert.deepEqual(missing.fontNames.hangul, { kind: 'unknown' });
  assert.equal(getSelectionFormatting(state({}, { format: 'hwpx' })).size, null);
});
