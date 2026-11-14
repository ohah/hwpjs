import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../packages/core/src/state/editor-state.ts';
import {
  captureInlineObjectInsertPayload,
  inlineObjectInsertMessage,
  getInlineObjectInsertAvailability,
} from '../../packages/core/src/commands/inline-object-insert.ts';
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
  paragraph: 0,
  startUnit: 1,
  endUnit: 1,
  affinity: 'forward',
};
const row = {
  section: 0,
  paragraph: 0,
  text: 'a😀b',
  selectionOwner: 'section:0:body',
  editable: true,
  plainEditable: true,
};
const content = {
  format: 'hwpx',
  paragraphs: [row],
  equationInsertionAvailable: true,
  chartCreationAvailable: true,
};
function state(patch = {}) {
  return new EditorState({
    ...target,
    status: 'ready',
    stateVersion: 7,
    selection: target,
    content,
    nativeHistoryRevision: 4,
    nativeHistoryStats: { protocolVersion: 2 },
    ...patch,
  });
}
const eq = {
  script: 'x',
  width: 1,
  height: 1,
  baseLine: 85,
  baseUnit: 1000,
  version: 'v',
  font: 'f',
};
const payload = { target, selectionVersion: 7, options: eq };
test('current caret produces exact source witness and 1based Native paragraph', () => {
  const msg = inlineObjectInsertMessage(payload, state(), 'equation');
  assert.equal(msg.kind, 'insert-equation');
  assert.equal(msg.request.paragraph, 1);
  assert.equal(msg.request.start, 1);
  assert.equal(msg.request.expectedText, row.text);
  const chart = inlineObjectInsertMessage(
    {
      ...payload,
      options: { width: 1, height: 1, categories: ['A'], series: [{ name: 'S', values: [-0] }] },
    },
    state(),
    'chart',
  );
  assert.deepEqual(chart.request.data.series, [{ name: 'S', values: ['0'] }]);
});
test('owner/caret/version/token/source guards fail closed', () => {
  for (const t of [
    { ...target, endUnit: 2 },
    { ...target, startUnit: 2, endUnit: 2 },
    { ...target, operationRevision: 1 },
    { ...target, owner: 'cell:0' },
    { ...target, section: 1 },
  ])
    assert.throws(() => inlineObjectInsertMessage({ ...payload, target: t }, state(), 'equation'));
  assert.throws(
    () => inlineObjectInsertMessage({ ...payload, selectionVersion: 6 }, state(), 'equation'),
    /Stale/,
  );
  assert.throws(
    () =>
      inlineObjectInsertMessage(
        payload,
        state({ selection: { ...target, startUnit: 0, endUnit: 0 } }),
        'equation',
      ),
    /Stale/,
  );
  for (const r of [
    { ...row, plainEditable: false },
    { ...row, createdCell: {} },
    { ...row, clipped: true },
  ])
    assert.equal(
      getInlineObjectInsertAvailability(
        state({ content: { ...content, paragraphs: [r] } }),
        'equation',
      ).enabled,
      false,
    );
});
test('ABI absence/history/readonly/limited state disables UI and dispatch', () => {
  for (const patch of [
    { content: { ...content, equationInsertionAvailable: false } },
    { nativeHistoryRevision: undefined },
    { historyRecoveryRequired: true },
    { content: { ...content, readOnly: true } },
    { content: { ...content, limited: true } },
    { status: 'refresh-required' },
  ]) {
    assert.equal(getInlineObjectInsertAvailability(state(patch), 'equation').enabled, false);
    assert.throws(() => inlineObjectInsertMessage(payload, state(patch), 'equation'));
  }
});
test('admission capture owns arrays and rejects accessors without invoking them', () => {
  const options = { width: 1, height: 1, categories: ['A'], series: [{ name: 'S', values: [1] }] };
  const owned = captureInlineObjectInsertPayload({ ...payload, options }, 'chart');
  options.series[0].values[0] = 9;
  assert.equal(owned.options.series[0].values[0], 1);
  let called = false;
  const values = [1];
  Object.defineProperty(values, '0', {
    get() {
      called = true;
      return 1;
    },
  });
  assert.throws(() =>
    captureInlineObjectInsertPayload(
      { ...payload, options: { ...options, series: [{ name: 'S', values }] } },
      'chart',
    ),
  );
  assert.equal(called, false);
  assert.throws(() =>
    captureInlineObjectInsertPayload({ ...payload, selectionVersion: -1 }, 'equation'),
  );
});
