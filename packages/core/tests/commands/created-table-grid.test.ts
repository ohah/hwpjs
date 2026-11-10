import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, createCommand, EDIT_CREATED_TABLE_GRID_COMMAND } from '../../src/index.ts';
import type { EditorRuntime, RuntimeMessage } from '../../src/contracts.ts';
import { createdTableGridMessage } from '../../src/commands/created-table-grid.ts';
import type { CreatedTableGridAction } from '../../src/commands/created-table-grid.ts';
import { applyCreatedTableGridCommand } from '../../../../web/preview/created-table-grid-command.mjs';
import { attachCreatedTables } from '../../../../web/preview/created-table-content.mjs';

const request = (action: CreatedTableGridAction = 'insert-row') => ({
  section: 0,
  identity: '18446744073709551615',
  action,
  index: 1,
});
async function setup(
  options: { available?: unknown; readonly?: boolean; projectionError?: boolean } = {},
) {
  const calls: RuntimeMessage[] = [];
  let revision = 0;
  const content = {
    format: 'hwpx',
    paragraphs: [{ section: 0, paragraph: 0, text: '', editable: true }],
    createdTableGridAvailable: Object.hasOwn(options, 'available') ? options.available : true,
    createdTables: [{ section: 0, identity: request().identity, rows: 2, columns: 2 }],
  };
  const runtime: EditorRuntime = {
    async request(message, context) {
      calls.push(message);
      const applied = message.kind === 'created-table-grid';
      if (applied) revision++;
      return {
        kind: message.kind,
        ...(applied && options.projectionError ? { error: 'ProjectionFailed' } : { content }),
        createdTableGridAvailable: content.createdTableGridAvailable,
        historyRevision: revision,
        meta: { context, application: applied ? 'applied' : 'unapplied', changed: applied },
      };
    },
    dispose() {},
  };
  const editor = createEditor({ runtimeFactory: () => runtime });
  await editor.load(new Uint8Array([1]), { format: 'hwpx', editable: !options.readonly });
  return { editor, calls, content };
}
for (const action of ['insert-row', 'delete-row', 'insert-column', 'delete-column'] as const)
  test(`${action} dispatches one identity-addressed command and publishes revision`, async () => {
    const h = await setup();
    try {
      const before = h.editor.getEditorState();
      const result = await h.editor.dispatchCommand(
        EDIT_CREATED_TABLE_GRID_COMMAND,
        request(action),
      );
      assert.equal(result.status, 'committed-with-snapshot');
      assert.deepEqual(
        h.calls.filter((c) => c.kind === 'created-table-grid'),
        [{ kind: 'created-table-grid', ...request(action) }],
      );
      const after = h.editor.getEditorState();
      assert.equal(after.operationRevision, before.operationRevision + 1);
      assert.equal(after.nativeHistoryRevision, 1);
      assert.equal(after.savedOperationRevision, before.savedOperationRevision);
    } finally {
      await h.editor.dispose();
    }
  });
test('invalid request fields and unknown session identity fail before runtime', async () => {
  const h = await setup();
  try {
    for (const patch of [
      { section: -1 },
      { section: -0 },
      { index: 1.2 },
      { index: 0x100000000 },
      { identity: '01' },
      { identity: '0' },
      { identity: '18446744073709551616' },
      { action: 'merge' },
      { extra: true },
    ]) {
      const result = await h.editor.dispatchCommand(EDIT_CREATED_TABLE_GRID_COMMAND, {
        ...request(),
        ...patch,
      } as any);
      assert.equal(result.status, 'rejected-unapplied');
    }
    assert.throws(
      () => createdTableGridMessage({ ...request(), identity: '2' }, h.editor.getEditorState()),
      /InvalidCreatedTableGridTarget/,
    );
    assert.throws(
      () => createdTableGridMessage({ ...request(), section: 1 }, h.editor.getEditorState()),
      /InvalidCreatedTableGridTarget/,
    );
    assert.equal(
      h.calls.some((c) => c.kind === 'created-table-grid'),
      false,
    );
  } finally {
    await h.editor.dispose();
  }
});
test('absent and non-true optional capability reject, readonly retains write policy', async () => {
  for (const available of [undefined, null, false, 'unknown']) {
    const h = await setup({ available });
    try {
      const r = await h.editor.dispatchCommand(EDIT_CREATED_TABLE_GRID_COMMAND, request());
      assert.equal(r.error, 'CreatedTableGridUnavailable');
      assert.equal(
        h.calls.some((c) => c.kind === 'created-table-grid'),
        false,
      );
    } finally {
      await h.editor.dispose();
    }
  }
  const h = await setup({ readonly: true });
  try {
    const before = h.editor.getEditorState();
    const r = await h.editor.dispatchCommand(EDIT_CREATED_TABLE_GRID_COMMAND, request());
    assert.equal(r.error, 'ReadOnlyDocument');
    assert.equal(h.editor.getEditorState(), before);
    assert.equal((before.capabilities as any).createdTableGridAvailable, false);
  } finally {
    await h.editor.dispose();
  }
});
test('dispatch captures owned payload and rejects second queued stale revision', async () => {
  const h = await setup();
  try {
    const payload = request(),
      a = h.editor.dispatchCommand(EDIT_CREATED_TABLE_GRID_COMMAND, payload);
    payload.identity = '2';
    const b = h.editor.dispatchCommand(EDIT_CREATED_TABLE_GRID_COMMAND, request());
    assert.equal((await a).status, 'committed-with-snapshot');
    assert.equal((await b).error, 'StaleTarget');
    assert.equal(h.calls.filter((c) => c.kind === 'created-table-grid').length, 1);
  } finally {
    await h.editor.dispose();
  }
});
test('surface admits grid and fences stale document, generation, operation and view tokens', async () => {
  const h = await setup();
  const lease = h.editor.acquireInputSurface({
    commitComposition: () => 'unchanged',
    cancelComposition() {},
  });
  try {
    const token = h.editor.getEditorState().token;
    for (const delta of [
      { documentId: 'other' },
      { generation: token.generation + 1 },
      { operationRevision: token.operationRevision + 1 },
      { viewRevision: token.viewRevision + 1 },
    ])
      await assert.rejects(
        lease.request(
          { kind: 'created-table-grid', ...request() },
          {
            token: { ...token, ...delta },
            coordinates: 'legacy-native',
          },
        ),
        /StaleTarget/,
      );
    const result = await lease.request(
      { kind: 'created-table-grid', ...request() },
      { token, coordinates: 'legacy-native' },
    );
    assert.equal((result as any).status, 'committed-with-snapshot');
    assert.equal(h.calls.filter((c) => c.kind === 'created-table-grid').length, 1);
  } finally {
    lease.release();
    await h.editor.dispose();
  }
});
test('post-application projection failure preserves dirty committed classification', async () => {
  const h = await setup({ projectionError: true });
  try {
    const before = h.editor.getEditorState();
    const r = await h.editor.dispatchCommand(EDIT_CREATED_TABLE_GRID_COMMAND, request());
    assert.equal(r.status, 'committed-refresh-required');
    assert.equal(r.error, 'ProjectionFailed');
    assert.equal(h.editor.getEditorState().operationRevision, before.operationRevision + 1);
  } finally {
    await h.editor.dispose();
  }
});
test('same command name with different symbol cannot bypass admission', async () => {
  const h = await setup();
  try {
    assert.equal(
      (await h.editor.dispatchCommand(createCommand('created-table-grid'), request())).error,
      'UnsupportedCommand',
    );
  } finally {
    await h.editor.dispose();
  }
});
test('Worker helper supports all actions and old ABI is rejected before mutation', () => {
  const calls: unknown[] = [];
  const editor = {
    supportsCreatedTableGrid: () => true,
    editCreatedTableGrid: (r: unknown) => calls.push(r),
  };
  for (const action of ['insert-row', 'delete-row', 'insert-column', 'delete-column'] as const) {
    applyCreatedTableGridCommand(editor, 'hwp5', true, {
      kind: 'created-table-grid',
      origin: 'canvas',
      ...request(action),
    });
    applyCreatedTableGridCommand(editor, 'hwpx', true, request(action));
  }
  assert.equal(calls.length, 8);
  assert.deepEqual({ ...(calls[0] as object) }, request());
  for (const supportsCreatedTableGrid of [undefined, () => false])
    assert.throws(
      () =>
        applyCreatedTableGridCommand(
          { ...editor, supportsCreatedTableGrid },
          'hwpx',
          true,
          request(),
        ),
      /CreatedTableGridUnavailable/,
    );
  assert.throws(
    () => applyCreatedTableGridCommand(editor, 'hwpx', false, request()),
    /EditorNotOpen/,
  );
  assert.equal(calls.length, 8);
});
test('HWPX content defaults old ABI capability to false', () => {
  const editor = { createdTables: () => [] };
  const base = () => ({ paragraphs: [{ section: 0, paragraph: 0, editable: true }] });
  assert.equal(attachCreatedTables(editor, base(), true, 100, 1).createdTableGridAvailable, false);
  assert.equal(
    attachCreatedTables({ ...editor, supportsCreatedTableGrid: () => true }, base(), true, 100, 1)
      .createdTableGridAvailable,
    true,
  );
});
