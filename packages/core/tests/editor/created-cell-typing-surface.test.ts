// Actual Core queue/lease/SSOT publication, controlled runtime. No Native claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../src/editor/create-editor.ts';
import type { EditorRuntime, RuntimeMessage } from '../../src/contracts.ts';

async function opened() {
  let revision = 0;
  let text = 'ABCD';
  const messages: RuntimeMessage[] = [];
  const content = () => ({
    format: 'hwp5',
    paragraphs: [
      { section: 0, paragraph: 0, text: 'host', editable: true, selectionOwner: 'section:0:body' },
    ],
    createdCellTypingScope: 7,
    createdTables: [
      {
        section: 0,
        identity: '9007199254740993',
        hostParagraph: 0,
        cells: [
          {
            paragraph_id: 1,
            row: 0,
            column: 0,
            text,
            character_runs: [{ start_unit: 0, char_shape_id: 0 }],
          },
        ],
      },
    ],
  });
  const runtime: EditorRuntime = {
    async request(message) {
      messages.push(structuredClone(message));
      if (message.kind === 'load' || message.kind === 'enable')
        return { kind: message.kind, content: content(), historyRevision: revision };
      if (message.kind === 'created-cell-splice') {
        assert.equal(message.identity, '9007199254740993');
        assert.equal(message.startUnit, 4);
        assert.equal(message.endUnit, 4);
        assert.equal(message.text, 'X');
        assert(!Object.hasOwn(message, 'paragraph'));
        text = 'ABCDX';
        revision++;
        return {
          kind: message.kind,
          content: content(),
          historyRevision: revision,
          meta: { application: 'applied', changed: true },
        };
      }
      return { kind: message.kind, error: 'UnexpectedRuntimeRequest', applied: false };
    },
    dispose() {},
  };
  const editor = createEditor({ runtimeFactory: () => runtime });
  await editor.load(new Uint8Array([1]), { format: 'hwp5' });
  const lease = editor.acquireInputSurface({
    commitComposition: () => 'unchanged',
    cancelComposition() {},
  });
  return { editor, lease, messages };
}
const request = () => ({
  kind: 'created-cell-splice',
  section: 0,
  identity: '9007199254740993',
  row: 0,
  column: 0,
  startUnit: 4,
  endUnit: 4,
  text: 'X',
  createdCellTypingScope: 7,
  expectedHistoryRevision: 0,
  insertion: { character: { textColor: 0, underline: { kind: 'bottom' } } },
});
test('Core generated-cell surface mutation keeps its logical namespace and publishes one runtime snapshot', async () => {
  const f = await opened();
  try {
    const before = f.editor.getEditorState();
    const payload = request();
    const task = f.lease.request(payload, { token: before.token, coordinates: 'legacy-native' });
    payload.text = 'caller changed';
    const result = await task;
    assert('status' in result);
    assert.equal(result.status, 'committed-with-snapshot');
    const after = f.editor.getEditorState();
    assert.notEqual(after.operationRevision, before.operationRevision);
    assert.equal(after.nativeHistoryRevision, 1);
    assert.equal((after.content as any).createdTables[0].cells[0].text, 'ABCDX');
    // A logical generated cell must not manufacture a source SelectionTarget.
    assert.equal(after.selection, undefined);
    assert.equal(f.messages.filter((m) => m.kind === 'created-cell-splice').length, 1);
  } finally {
    f.lease.release();
    await f.editor.dispose();
  }
});
test('a revoked generated-cell input lease cannot send the new mutation kind', async () => {
  const f = await opened();
  try {
    const token = f.editor.getEditorState().token;
    f.lease.release();
    await assert.rejects(
      f.lease.request(request(), { token, coordinates: 'legacy-native' }),
      /Surface|Lease|Detached/,
    );
    assert.equal(f.messages.filter((m) => m.kind === 'created-cell-splice').length, 0);
  } finally {
    await f.editor.dispose();
  }
});
