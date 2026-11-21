import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditor,
  CREATE_CHART_COMMAND,
  hwp5ChartCreatePreviewMessage,
} from '../../packages/core/src/index.ts';
import { bindRuntimeAdmission } from '../../packages/core/src/internal/runtime-admission.ts';
import { createParagraphSelection } from '../../packages/core/src/state/paragraph-selection.ts';
const options = () => ({
  profile: 'spec24-registered-png-presentation-v1',
  width: 20001,
  height: 12000,
  categories: ['One', 'Two', 'Three'],
  series: [{ name: 'Own', values: [10, 20, 30] }],
  preview: { width: 270, height: 162 },
});
function harness(available = true) {
  const calls = [];
  let revision = 0,
    closed = false;
  const reference = Object.freeze({
    scope: 'runtime-owned',
    epoch: '1',
    kind: 'original',
    section: 0,
    id: '4',
    row: 0,
    column: 0,
  });
  const runtime = {
    async request(message, context) {
      calls.push(structuredClone(message));
      if (message.kind === 'create-chart') revision++;
      return {
        kind: message.kind,
        historyRevision: revision,
        historyRevisions: [revision],
        historyStats: { protocolVersion: 2 },
        meta: { context, application: 'applied', changed: message.kind === 'create-chart' },
        ...(message.kind === 'hwp5-chart-create-preview'
          ? { preview: new Uint8Array([1, 2, 3]) }
          : {}),
        content: {
          format: 'hwp5',
          chartCreationAvailable: available,
          hwp5ChartCreateProfileVersion: 1,
          paragraphs: [
            {
              section: 0,
              paragraph: 0,
              text: '\ufffc\ufffchello',
              editable: true,
              selectionOwner: 'section:0:body',
              currentReference: reference,
              sourceOffsets: [
                { at: 0, source: 0 },
                { at: 1, source: 8 },
                { at: 2, source: 16 },
              ],
            },
          ],
        },
      };
    },
    dispose() {
      closed = true;
    },
  };
  bindRuntimeAdmission(
    runtime,
    async (message, context, admit) => {
      admit();
      return runtime.request(message, context);
    },
    () => !closed,
  );
  const editor = createEditor({ runtimeFactory: () => runtime });
  return {
    editor,
    calls,
    async open() {
      await editor.load(new Uint8Array([1]), { format: 'hwp5' });
      await editor.setSelection(
        createParagraphSelection(editor.getEditorState(), {
          section: 0,
          paragraph: 0,
          startUnit: 2,
        }),
      );
    },
    payload() {
      const s = editor.getEditorState();
      return { target: s.selection, selectionVersion: s.stateVersion, options: options() };
    },
  };
}
test('public Core dispatch uses the queued current-caret chart path and commits one Native request', async () => {
  const h = harness();
  try {
    await h.open();
    const result = await h.editor.dispatchCommand(CREATE_CHART_COMMAND, h.payload());
    assert.equal(result.status, 'committed-with-snapshot');
    const writes = h.calls.filter((x) => x.kind === 'create-chart');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].request.start, 16);
    assert.equal(writes[0].request.reference.id, '4');
    assert.equal(writes[0].request.width, 20001);
    assert.equal(h.editor.getEditorState().nativeHistoryRevision, 1);
  } finally {
    h.editor.dispose();
  }
});
test('public Core readonly preview carries its token and cannot become a create request', async () => {
  const h = harness();
  try {
    await h.open();
    const state = h.editor.getEditorState();
    const reply = await h.editor.readResource(hwp5ChartCreatePreviewMessage(h.payload(), state), {
      token: state.token,
    });
    assert.deepEqual(reply.preview, new Uint8Array([1, 2, 3]));
    assert.equal(h.calls.filter((x) => x.kind === 'create-chart').length, 0);
    assert.equal(h.editor.getEditorState().nativeHistoryRevision, 0);
  } finally {
    h.editor.dispose();
  }
});
test('public Core dispatch keeps unavailable engines away from Runtime mutation', async () => {
  const h = harness(false);
  try {
    await h.open();
    const result = await h.editor.dispatchCommand(CREATE_CHART_COMMAND, h.payload());
    assert.notEqual(result.status, 'committed-with-snapshot');
    assert.equal(h.calls.filter((x) => x.kind === 'create-chart').length, 0);
  } finally {
    h.editor.dispose();
  }
});
