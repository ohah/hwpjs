import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../src/state/editor-state.ts';
import {
  documentTextSelectionObservation,
  isCurrentDocumentTextSelectionObservation,
} from '../../src/state/document-text-selection.ts';
function fixture() {
  const state = new EditorState({
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
    stateVersion: 1,
    status: 'ready',
    content: { format: 'hwpx', paragraphs: [] },
  });
  const request: any = {
    schemaVersion: 1,
    scope: 'native-document-text-selection',
    binding: { session: 's1', revision: null },
    readBinding: { epoch: '1', serial: '2' },
    ref: 'd2-owner:g2',
    startUnit: 0,
    endUnit: 1,
    expectedOriginal: 'x',
  };
  const value: any = {
    ...request,
    coordinateSpace: 'native-current-text-observation',
    executionAuthority: false,
    format: 'hwpx',
    beforeText: 'x',
    target: { kind: 'paragraph', section: 0, paragraph: 9001, startUnit: 0, endUnit: 1 },
  };
  const observation = documentTextSelectionObservation(state, request, value, 0);
  return { state, observation };
}
test('issued read observation has a private identity that spread and JSON copies cannot recreate', () => {
  const { state, observation } = fixture();
  assert(isCurrentDocumentTextSelectionObservation(observation, state));
  assert(!isCurrentDocumentTextSelectionObservation({ ...observation }, state));
  assert(
    !isCurrentDocumentTextSelectionObservation(JSON.parse(JSON.stringify(observation)), state),
  );
});
test('selection-only publication can retain read observation but doc/view/content transitions cannot', () => {
  const { state, observation } = fixture();
  const current = (patch: any = {}) =>
    new EditorState({ ...state, content: state.content, stateVersion: 2, ...patch } as any);
  assert(isCurrentDocumentTextSelectionObservation(observation, current()));
  for (const patch of [
    { documentId: 'other' },
    { generation: 2 },
    { operationRevision: 2 },
    { viewRevision: 2 },
    { nativeHistoryRevision: 0 },
    { content: { format: 'hwpx', paragraphs: [] } },
  ])
    assert(!isCurrentDocumentTextSelectionObservation(observation, current(patch)));
});
