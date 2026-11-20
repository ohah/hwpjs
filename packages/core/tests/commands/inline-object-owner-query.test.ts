// Actual headless command queue with controlled JS runtime, no engine execution.
import test from 'node:test';
import type { RuntimeReply } from '../../src/contracts.ts';
import assert from 'node:assert/strict';
import { createEditor, CREATE_CHART_COMMAND } from '../../src/index.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';

test('headless owner query and typed generated-cell dispatch use admitted public API without a Surface', async () => {
  const messages: any[] = [];
  let revision = 4,
    mismatch = false;
  const binding = () => ({ session: 's7', revision, serial: '9007199254740993' });
  const content = {
    format: 'hwpx',
    limited: false,
    inlineObjectPlacementVersion: 1,
    chartCreationAvailable: true,
    equationInsertionAvailable: true,
    paragraphs: [
      { section: 2, paragraph: 5, text: '', editable: true, selectionOwner: 'section:2:body' },
    ],
    createdTables: [
      { section: 2, identity: '9007199254740993', cells: [{ row: 0, column: 1, text: '앞😀뒤' }] },
    ],
  };
  const runtime = {
    async request(message: any, context: any) {
      messages.push(structuredClone(message));
      if (message.kind === 'create-chart') revision++;
      const reply: RuntimeReply = {
        kind: message.kind,
        historyRevision: revision,
        historyRevisions: [revision],
        historyStats: {
          protocolVersion: 2,
          requested: {},
          resolved: {},
          retainedBytes: null,
          metadataOwnedBytes: null,
          currentOwnedBytes: null,
          undoOwnedBytes: null,
          redoOwnedBytes: null,
          evictedCount: null,
        },
        meta: { context, application: 'applied', changed: true },
      };
      if (message.kind === 'inline-object-owner')
        return {
          ...reply,
          inlineObjectOwner: {
            schemaVersion: 1,
            section: mismatch ? 3 : 2,
            expected_text: '앞😀뒤',
            owner: {
              kind: 'createdCell',
              binding: binding(),
              identity: '9007199254740993',
              row: 0,
              column: 1,
            },
          },
        };
      return { ...reply, content };
    },
    dispose() {},
  };
  bindRuntimeAdmission(
    runtime as any,
    async (m, c, admit) => {
      admit();
      return runtime.request(m, c);
    },
    () => true,
  );
  const editor = createEditor({ runtimeFactory: () => runtime as any });
  try {
    await editor.load(new Uint8Array([1]), { format: 'hwpx' });
    const before = editor.getEditorState();
    const selector = {
      section: 2,
      created_cell: { identity: '9007199254740993', row: 0, column: 1 },
    };
    const target = await editor.getInlineObjectInsertTarget(selector, 3, { affinity: 'backward' });
    assert.equal(editor.getEditorState(), before);
    assert.equal(Object.hasOwn(target.address, 'paragraph'), false);
    assert.equal(target.address.affinity, 'backward');
    assert(Object.isFrozen(target.address));
    assert(Object.isFrozen(target.address.owner!.binding));
    assert.deepEqual(messages.at(-1), { kind: 'inline-object-owner', selector });
    mismatch = true;
    await assert.rejects(editor.getInlineObjectInsertTarget(selector, 3), /OwnerMismatch/);
    mismatch = false;
    const result = await editor.dispatchCommand(CREATE_CHART_COMMAND, {
      target,
      selectionVersion: before.stateVersion,
      options: { width: 200, height: 100, categories: ['A'], series: [{ name: 'S', values: [1] }] },
    });
    assert.equal(result.status, 'committed-with-snapshot');
    const writes = messages.filter((m) => m.kind === 'create-chart');
    assert.equal(writes.length, 1);
    assert.equal(Object.hasOwn(writes[0].request.target, 'paragraph'), false);
    assert.deepEqual(writes[0].request.target.owner, target.address.owner);
    assert.equal(writes[0].request.target.affinity, 'backward');
    const rejected = await editor.dispatchCommand(CREATE_CHART_COMMAND, {
      target,
      selectionVersion: before.stateVersion,
      options: { width: 200, height: 100, categories: ['A'], series: [{ name: 'S', values: [1] }] },
    });
    assert.equal(rejected.status, 'rejected-unapplied');
    assert.match(rejected.error ?? '', /Stale/);
    assert.equal(messages.filter((m) => m.kind === 'create-chart').length, 1);
  } finally {
    await editor.dispose();
  }
});
