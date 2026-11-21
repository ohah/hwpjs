import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureInlineObjectInsertPayload,
  inlineObjectInsertMessage,
  hwp5ChartCreatePreviewMessage,
  getInlineObjectInsertAvailability,
} from '../../packages/core/src/commands/inline-object-insert.ts';
import { surfaceOperation } from '../../packages/core/src/commands/surface-protocol.ts';
const profile = 'spec24-registered-png-presentation-v1';
const options = () => ({
  profile,
  width: 20001,
  height: 12000,
  categories: ['One', 'Two', 'Three'],
  series: [{ name: 'Own', values: [10, 20, 30] }],
  preview: { width: 270, height: 162 },
});
function fixture(format = 'hwp5') {
  const token = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 2,
    viewRevision: 3,
  };
  const reference = Object.freeze({
    scope: 'editor:1',
    epoch: '9',
    kind: 'original',
    section: 0,
    id: '4',
    row: 0,
    column: 0,
  });
  const row = {
    section: 0,
    paragraph: 0,
    text: '\ufffc\ufffchello',
    editable: true,
    plainEditable: true,
    selectionOwner: 'section:0:body',
    currentReference: reference,
    sourceOffsets: [
      { at: 0, source: 0 },
      { at: 1, source: 8 },
      { at: 2, source: 16 },
    ],
  };
  const target = {
    ...token,
    coordinateSpace: 'display',
    format,
    owner: 'section:0:body',
    section: 0,
    paragraph: 0,
    startUnit: 2,
    endUnit: 2,
    affinity: 'forward',
  };
  const state = {
    ...token,
    token,
    stateVersion: 7,
    status: 'ready',
    nativeHistoryRevision: 5,
    nativeHistoryStats: { protocolVersion: 2 },
    selection: target,
    content: {
      format,
      paragraphs: [row],
      chartCreationAvailable: true,
      hwp5ChartCreateProfileVersion: 1,
      chartCreateProfileVersion: 1,
    },
    capabilities: {},
  };
  const payload = { target, selectionVersion: 7, options: options() };
  return { state, row, target, payload, reference };
}
test('public SDK maps a fresh HWP5 display caret to its scoped current reference and raw source unit', () => {
  const f = fixture();
  const captured = captureInlineObjectInsertPayload(f.payload, 'chart');
  f.payload.options.series[0].values[0] = 999;
  const message = inlineObjectInsertMessage(captured, f.state, 'chart');
  assert.equal(message.kind, 'create-chart');
  assert.equal(message.request.reference, f.reference);
  assert.equal(message.request.start, 16);
  assert.equal(message.request.width, 20001);
  assert.equal(message.request.series[0].values[0], 10);
  assert.equal(message.request.profile, profile);
  assert.equal(Object.hasOwn(message.request, 'png'), false);
  assert.equal(Object.hasOwn(message.request, 'paragraph'), false);
});
test('SDK readonly preview uses the same admitted request and stays a read operation', () => {
  const f = fixture();
  const message = hwp5ChartCreatePreviewMessage(f.payload, f.state);
  assert.equal(message.kind, 'hwp5-chart-create-preview');
  assert.equal(surfaceOperation(message.kind), 'read');
  assert.deepEqual(message.request, inlineObjectInsertMessage(f.payload, f.state, 'chart').request);
  f.state.stateVersion++;
  assert.throws(
    () => hwp5ChartCreatePreviewMessage(f.payload, f.state),
    /StaleInlineObjectInsertSelection/,
  );
});
test('missing capability, profile and History2 never become a creation attempt', () => {
  for (const mutate of [
    (f) => {
      f.state.content.chartCreationAvailable = false;
    },
    (f) => {
      f.state.content.hwp5ChartCreateProfileVersion = 0;
    },
    (f) => {
      f.state.nativeHistoryStats.protocolVersion = 1;
    },
    (f) => {
      f.state.historyRecoveryRequired = true;
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(getInlineObjectInsertAvailability(f.state, 'chart').enabled, false);
    assert.throws(() => inlineObjectInsertMessage(f.payload, f.state, 'chart'));
  }
});
test('table, drawing and missing current-reference owners remain refused', () => {
  for (const mutate of [
    (f) => {
      f.row.tableCell = {};
    },
    (f) => {
      f.row.createdCell = {};
    },
    (f) => {
      f.row.drawingText = {};
    },
    (f) => {
      delete f.row.currentReference;
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => inlineObjectInsertMessage(f.payload, f.state, 'chart'));
  }
});
test('readonly, limited windows and pending unproven owners remain refused', () => {
  for (const mutate of [
    (f) => {
      f.state.content.readOnly = true;
    },
    (f) => {
      f.state.content.limited = true;
    },
    (f) => {
      f.state.content.window = {};
    },
    (f) => {
      f.state.content.createdTableHostPending = true;
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => inlineObjectInsertMessage(f.payload, f.state, 'chart'));
  }
});
test('a range or stale generation cannot be rewritten into the current caret', () => {
  const f = fixture();
  f.payload.target = { ...f.target, startUnit: 2, endUnit: 3 };
  assert.throws(
    () => inlineObjectInsertMessage(f.payload, f.state, 'chart'),
    /InlineObjectInsertionRequiresCaret/,
  );
  const g = fixture();
  g.payload.target = { ...g.target, generation: 0 };
  assert.throws(() => inlineObjectInsertMessage(g.payload, g.state, 'chart'), /StaleTarget/);
});
test('existing HWPX default chart request preserves its prior wire contract', () => {
  const f = fixture('hwpx');
  const o = options();
  delete o.profile;
  delete o.preview;
  f.payload.options = o;
  const captured = captureInlineObjectInsertPayload(f.payload, 'chart');
  const message = inlineObjectInsertMessage(captured, f.state, 'chart');
  assert.deepEqual(Object.keys(message.request).sort(), ['data', 'size', 'target']);
  assert.deepEqual(message.request.size, { width: 20001, height: 12000 });
  assert.deepEqual(message.request.data.series[0].values, ['10', '20', '30']);
  assert.equal(message.request.target.paragraph, 1);
  assert.equal(message.request.target.unit, 2);
});
