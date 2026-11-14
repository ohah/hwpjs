import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../src/state/editor-state.ts';
import {
  inlineObjectInsertMessage,
  getInlineObjectInsertAvailability,
} from '../../src/commands/inline-object-insert.ts';
import { currentDocumentInsertCaret } from '../../src/commands/document-insert.ts';
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
const row = {
  section: 0,
  paragraph: 1,
  text: '',
  selectionOwner: 'section:0:body',
  editable: true,
  plainEditable: false,
  anchorEditable: true,
};
const content = {
  format: 'hwpx',
  paragraphs: [row],
  equationInsertionAvailable: true,
  chartCreationAvailable: true,
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
const chart = {
  width: 16000,
  height: 10000,
  categories: ['추가'],
  series: [{ name: '두 번째', values: [42] }],
};
const state = (patch: any = {}) =>
  new EditorState({
    ...target,
    status: 'ready',
    stateVersion: 7,
    selection: target,
    content,
    nativeHistoryRevision: 4,
    nativeHistoryStats: { protocolVersion: 2 },
    ...patch,
  } as any);
for (const kind of ['equation', 'chart'] as const)
  test(`empty anchored body is allowed only for ${kind} creation`, () => {
    const s = state(),
      message = inlineObjectInsertMessage(
        kind === 'equation'
          ? { target, selectionVersion: 7, options: equation }
          : { target, selectionVersion: 7, options: chart },
        s,
        kind,
      ) as any;
    assert.equal(getInlineObjectInsertAvailability(s, kind).enabled, true);
    assert.equal(message.request.target?.paragraph ?? message.request.paragraph, 2);
    assert.equal(message.request.target?.unit ?? message.request.start, 0);
    assert.equal(message.request.target?.expected_text ?? message.request.expectedText, '');
    assert.throws(() => currentDocumentInsertCaret(s, target, 7), /UnsupportedDocumentInsertOwner/);
  });
test('anchored relaxation excludes nonempty, uneditable, clipped, cell and drawing rows', () => {
  for (const patch of [
    { text: 'X' },
    { text: '\ufffc' },
    { anchorEditable: false },
    { editable: false },
    { clipped: true },
    { createdCell: {} },
    { tableCell: { tableNode: 0, listNode: 0 } },
    { drawingText: { drawingNode: 0, listNode: 0 } },
    { drawingCaption: { drawingNode: 0, listNode: 0 } },
  ])
    assert.equal(
      getInlineObjectInsertAvailability(
        state({ content: { ...content, paragraphs: [{ ...row, ...patch }] } }),
        'equation',
      ).enabled,
      false,
      JSON.stringify(patch),
    );
});
test('empty anchor keeps version/token/owner/caret/live selection fences', () => {
  for (const t of [
    { ...target, operationRevision: 1 },
    { ...target, viewRevision: 2 },
    { ...target, owner: 'cell:0' },
    { ...target, section: 1 },
    { ...target, startUnit: 1, endUnit: 1 },
    { ...target, endUnit: 1 },
  ])
    assert.throws(() =>
      inlineObjectInsertMessage(
        { target: t as any, selectionVersion: 7, options: equation },
        state(),
        'equation',
      ),
    );
  assert.throws(
    () =>
      inlineObjectInsertMessage(
        { target, selectionVersion: 6, options: equation },
        state(),
        'equation',
      ),
    /Stale/,
  );
  assert.throws(
    () =>
      inlineObjectInsertMessage(
        { target, selectionVersion: 7, options: equation },
        state({ selection: { ...target, affinity: 'backward' } }),
        'equation',
      ),
    /Stale/,
  );
});
test('empty anchor does not bypass history/availability/full-document/read-only admission', () => {
  for (const patch of [
    { nativeHistoryStats: { protocolVersion: 1 } },
    { nativeHistoryRevision: undefined },
    { historyRecoveryRequired: true },
    { status: 'refresh-required' },
    { content: { ...content, readOnly: true } },
    { content: { ...content, limited: true } },
    { content: { ...content, window: {} } },
    { content: { ...content, equationInsertionAvailable: false } },
  ])
    assert.equal(
      getInlineObjectInsertAvailability(state(patch), 'equation').enabled,
      false,
      JSON.stringify(patch),
    );
});
test('existing plain paragraph creation and scalar boundary checks remain', () => {
  const textRow = { ...row, text: 'a😀b', plainEditable: true, anchorEditable: false };
  const t = { ...target, startUnit: 1, endUnit: 1 };
  const s = state({ selection: t, content: { ...content, paragraphs: [textRow] } });
  assert.equal(getInlineObjectInsertAvailability(s, 'equation').enabled, true);
  const split = { ...target, startUnit: 2, endUnit: 2 };
  assert.throws(
    () =>
      inlineObjectInsertMessage(
        { target: split, selectionVersion: 7, options: equation },
        state({ selection: split, content: { ...content, paragraphs: [textRow] } }),
        'equation',
      ),
    /ScalarBoundary/,
  );
});
