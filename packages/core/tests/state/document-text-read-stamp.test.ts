import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../src/state/editor-state.ts';
import {
  createDocumentTextIndex,
  findDocumentTextMatch,
} from '../../src/state/document-text-search.ts';
import { documentTextAnchorRequest } from '../../src/state/document-text-anchor.ts';
import { documentTextSelectionRequest } from '../../src/state/document-text-selection.ts';
function fixture() {
  const state = new EditorState({
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
    stateVersion: 4,
    status: 'ready',
    content: { format: 'hwpx', paragraphs: [] },
  });
  const snapshot = {
    schemaVersion: 1,
    scope: 'native-document-text',
    complete: true,
    format: 'hwpx',
    binding: { session: 's7', revision: null },
    readBinding: { epoch: '7', serial: '9007199254740993' },
    coverage: { totalParagraphs: 1, sections: [{ section: 0, paragraphCount: 1 }] },
    rows: [{ ordinal: 0, section: 0, paragraph: 9001, ref: 'observed-owner', text: 'abc' }],
  };
  return { state, snapshot };
}
test('readonly Core copies the captured Native stamp into anchor and selection without History synthesis', () => {
  const { state, snapshot } = fixture(),
    index = createDocumentTextIndex(state, snapshot);
  snapshot.readBinding.serial = '9007199254740994';
  const anchor = documentTextAnchorRequest(
    index,
    { kind: 'paragraph', section: 0, paragraph: 41, unit: 0, beforeText: 'abc' },
    state,
  );
  assert.equal(Object.getPrototypeOf(anchor.readBinding), null);
  assert.deepEqual(
    anchor.readBinding,
    Object.assign(Object.create(null), { epoch: '7', serial: '9007199254740993' }),
  );
  const match = findDocumentTextMatch(index, 'a', { direction: 'forward' });
  assert(match);
  const selection = documentTextSelectionRequest(index, match, state);
  assert.deepEqual(selection.readBinding, anchor.readBinding);
  assert.equal(selection.binding.revision, null);
  assert(Object.isFrozen(selection.readBinding));
  assert.equal(state.nativeHistoryRevision, undefined);
});
test('Core refuses malformed or injected Native read-stamp fields at snapshot admission', () => {
  for (const stamp of [
    { epoch: '0', serial: '1' },
    { epoch: '7', serial: '01' },
    { epoch: '7', serial: '18446744073709551616' },
    { epoch: '7', serial: '1', historyRevision: 0 },
  ]) {
    const { state, snapshot } = fixture();
    snapshot.readBinding = stamp as any;
    assert.throws(() => createDocumentTextIndex(state, snapshot), /IncompleteDocumentTextSnapshot/);
  }
});
