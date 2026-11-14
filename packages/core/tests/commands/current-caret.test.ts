import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../src/state/editor-state.ts';
import { validateCurrentCaret } from '../../src/commands/current-caret.ts';
import { currentDocumentInsertCaret } from '../../src/commands/document-insert.ts';
import { inlineObjectInsertMessage } from '../../src/commands/inline-object-insert.ts';
const target = {
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 2,
  viewRevision: 3,
  coordinateSpace: 'display',
  format: 'hwpx',
  owner: 'section:0:body',
  section: 0,
  paragraph: 1,
  startUnit: 0,
  endUnit: 0,
  affinity: 'forward',
} as const;
const plain = {
  section: 0,
  paragraph: 1,
  text: '',
  selectionOwner: 'section:0:body',
  editable: true,
  plainEditable: true,
  anchorEditable: false,
};
const equation = {
  script: 'a+b',
  width: 6000,
  height: 2000,
  baseLine: 85,
  baseUnit: 1000,
  version: 'Equation Version 60',
  font: 'HYhwpEQ',
};
const state = (patch: any = {}) =>
  new EditorState({
    ...target,
    status: 'ready',
    stateVersion: 7,
    selection: target,
    nativeHistoryRevision: 4,
    nativeHistoryStats: { protocolVersion: 2 },
    content: { format: 'hwpx', paragraphs: [plain], equationInsertionAvailable: true },
    ...patch,
  } as any);
const create = (s: EditorState, t: any = target, version = 7) =>
  inlineObjectInsertMessage(
    { target: t, selectionVersion: version, options: equation },
    s,
    'equation',
  );
test('shared current caret keeps strict document and creation callers on the real observation', () => {
  const s = state(),
    before = s.content;
  assert.deepEqual(currentDocumentInsertCaret(s, target, 7), target);
  const message = create(s);
  assert.ok('paragraph' in message.request);
  assert.equal(message.request.paragraph, 2);
  assert.equal(validateCurrentCaret(s, target, 7).text, '');
  assert.deepEqual(s.content, before);
});
test('both callers preserve their existing stale-version and missing-caret diagnostics', () => {
  assert.throws(
    () => currentDocumentInsertCaret(state(), target, 6),
    /StaleDocumentInsertSelection/,
  );
  assert.throws(() => create(state(), target, 6), /StaleInlineObjectInsertSelection/);
  assert.throws(
    () => currentDocumentInsertCaret(state({ selection: null }), target, 7),
    /DocumentInsertionRequiresCaret/,
  );
  assert.throws(() => create(state({ selection: null })), /InlineObjectInsertionRequiresCaret/);
});
test('both callers share live selection, token, collapsed caret and scalar fences', () => {
  for (const s of [
    state({ selection: { ...target, affinity: 'backward' } }),
    state({ selection: { ...target, operationRevision: 1 } }),
    state({ selection: { ...target, endUnit: 1 } }),
  ]) {
    assert.throws(() => currentDocumentInsertCaret(s, target, 7));
    assert.throws(() => create(s));
  }
  const s = state({
      content: {
        format: 'hwpx',
        paragraphs: [{ ...plain, text: 'a😀b' }],
        equationInsertionAvailable: true,
      },
    }),
    split = { ...target, startUnit: 2, endUnit: 2 };
  assert.throws(() => currentDocumentInsertCaret(s, split, 7), /ScalarBoundary/);
  assert.throws(() => create(s, split), /ScalarBoundary/);
});
test('empty anchor remains creation-only without changing plainEditable or cloning state', () => {
  const row = { ...plain, plainEditable: false, anchorEditable: true };
  const s = state({
    content: { format: 'hwpx', paragraphs: [row], equationInsertionAvailable: true },
  });
  const before = s.content;
  assert.equal(validateCurrentCaret(s, target, 7).text, '');
  assert.throws(() => currentDocumentInsertCaret(s, target, 7), /UnsupportedDocumentInsertOwner/);
  const message = create(s);
  assert.ok('expectedText' in message.request);
  assert.equal(message.request.expectedText, '');
  assert.deepEqual(s.content, before);
  assert.equal((s.content as any).paragraphs[0].plainEditable, false);
});
