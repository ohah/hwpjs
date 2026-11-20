import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../src/state/editor-state.ts';
import { createParagraphSelection } from '../../src/state/paragraph-selection.ts';
import { reobserveReadViewSelection } from '../../src/state/read-view-selection.ts';
import {
  createDocumentTextIndex,
  assertDocumentTextIndexCurrent,
} from '../../src/state/document-text-search.ts';
function model(patch: any = {}) {
  const content = {
    format: 'hwpx',
    paragraphs: [
      {
        section: 0,
        paragraph: 9001,
        text: 'ab',
        selectable: true,
        editable: false,
        selectionOwner: 'section:0:body',
        currentReference: { kind: 'original', section: 0, node: 41 },
      },
    ],
  };
  let before = new EditorState({
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
    stateVersion: 1,
    status: 'ready',
    content,
    ...patch,
  });
  const selection = createParagraphSelection(before, { section: 0, paragraph: 9001, startUnit: 1 });
  before = new EditorState({
    ...before,
    content,
    selection,
    capabilities: { readOnly: true },
  } as any);
  const next = {
    content,
    capabilities: { readOnly: true },
    viewRevision: 2,
    nativeHistoryRevision: undefined,
  };
  return { before, next };
}
test('fresh view reobserves only UI caret coordinates while the old Native index remains stale', () => {
  const { before, next } = model();
  const index = createDocumentTextIndex(before, {
    schemaVersion: 1,
    scope: 'native-document-text',
    complete: true,
    format: 'hwpx',
    binding: { session: 'native', revision: null },
    readBinding: { epoch: '1', serial: '0' },
    coverage: { totalParagraphs: 1, sections: [{ section: 0, paragraphCount: 1 }] },
    rows: [{ ordinal: 0, section: 0, paragraph: 0, ref: 'd2-p1:0:0:rn:g0', text: 'ab' }],
  });
  const selected = reobserveReadViewSelection(before, next);
  assert(selected);
  assert.equal(selected.startUnit, 1);
  assert.equal(selected.viewRevision, 2);
  assert(!Object.hasOwn(selected, 'ref'));
  assert(!Object.hasOwn(selected, 'readBinding'));
  const after = new EditorState({
    ...before,
    ...next,
    stateVersion: 2,
    selection: selected,
  } as any);
  assert.throws(
    () => assertDocumentTextIndexCurrent(index, after),
    /StaleTarget|StaleDocumentTextSnapshot/,
  );
  assert.equal(index.native.readBinding?.serial, '0');
  assert.equal(index.native.rows[0].ref, 'd2-p1:0:0:rn:g0');
});
test('changed owner, text, coordinate basis, duplicate row or Native history cannot inherit a UI selection', () => {
  const { before, next } = model(),
    row = next.content.paragraphs[0];
  for (const patch of [
    { text: 'xy' },
    { selectionOwner: 'foreign' },
    { currentReference: { kind: 'original', section: 0, node: 42 } },
    { sourceOffsets: [0, 2, 4] },
    { clipped: true },
  ])
    assert.equal(
      reobserveReadViewSelection(before, {
        ...next,
        content: { ...next.content, paragraphs: [{ ...row, ...patch }] },
      }),
      undefined,
    );
  assert.equal(
    reobserveReadViewSelection(before, { ...next, nativeHistoryRevision: 7 }),
    undefined,
  );
  assert.equal(
    reobserveReadViewSelection(before, {
      ...next,
      content: { ...next.content, paragraphs: [row, row] },
    }),
    undefined,
  );
  assert.equal(
    reobserveReadViewSelection(before, { ...next, historyRecoveryRequired: true }),
    undefined,
  );
  for (const patch of [
    { documentId: 'other' },
    { generation: 2 },
    { operationRevision: 2 },
    { status: 'refresh-required' as const },
  ])
    assert.equal(reobserveReadViewSelection(before, { ...next, ...patch }), undefined);
});
