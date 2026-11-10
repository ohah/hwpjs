import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, createCommand, EDIT_SOURCE_TABLE_GRID_COMMAND } from '../../src/index.ts';
import type { EditorRuntime, RuntimeMessage } from '../../src/contracts.ts';
import { sourceTableGridMessage } from '../../src/commands/source-table-grid.ts';
import type { SourceTableGridAction } from '../../src/commands/source-table-grid.ts';
// @ts-ignore Shared Worker helper is JavaScript.
import { applySourceTableGridCommand } from '../../../../web/preview/source-table-grid-command.mjs';

const request = (action: SourceTableGridAction = 'insert-row') => ({
  section: 0,
  tableNode: 9,
  expectedRows: 2,
  expectedColumns: 2,
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
    sourceTableGridAvailable: Object.hasOwn(options, 'available') ? options.available : true,
    tables: [{ section: 0, tableNode: 9, rows: 2, columns: 2, cells: [] }],
  };
  const runtime: EditorRuntime = {
    async request(message, context) {
      calls.push(message);
      const applied = message.kind === 'source-table-grid';
      if (applied) revision++;
      return {
        kind: message.kind,
        ...(applied && options.projectionError ? { error: 'ProjectionFailed' } : { content }),
        sourceTableGridAvailable: content.sourceTableGridAvailable,
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
  test(`${action} dispatches one source-addressed command and publishes revision`, async () => {
    const h = await setup();
    try {
      const before = h.editor.getEditorState();
      const result = await h.editor.dispatchCommand(
        EDIT_SOURCE_TABLE_GRID_COMMAND,
        request(action),
      );
      assert.equal(result.status, 'committed-with-snapshot');
      assert.deepEqual(
        h.calls.filter((c) => c.kind === 'source-table-grid'),
        [{ kind: 'source-table-grid', ...request(action) }],
      );
      const after = h.editor.getEditorState();
      assert.equal(after.operationRevision, before.operationRevision + 1);
      assert.equal(after.nativeHistoryRevision, 1);
      assert.equal(after.savedOperationRevision, before.savedOperationRevision);
    } finally {
      await h.editor.dispose();
    }
  });
test('invalid fields and accessors reject before runtime', async () => {
  const h = await setup();
  try {
    for (const patch of [
      { section: -0 },
      { tableNode: -1 },
      { expectedRows: 0 },
      { expectedColumns: 0 },
      { action: 4 },
      { index: 3 },
      { extra: 1 },
    ])
      assert.throws(() =>
        h.editor.dispatchCommand(EDIT_SOURCE_TABLE_GRID_COMMAND, { ...request(), ...patch } as any),
      );
    const input = request();
    Object.defineProperty(input, 'tableNode', {
      get() {
        throw Error('GetterInvoked');
      },
    });
    assert.throws(
      () => h.editor.dispatchCommand(EDIT_SOURCE_TABLE_GRID_COMMAND, input),
      /InvalidSourceTableGridRequest/,
    );
    const hidden = request();
    Object.defineProperty(hidden, 'index', { enumerable: false });
    assert.throws(() => h.editor.dispatchCommand(EDIT_SOURCE_TABLE_GRID_COMMAND, hidden));
    assert.equal(
      h.calls.some((c) => c.kind === 'source-table-grid'),
      false,
    );
    assert.equal(
      sourceTableGridMessage(request('insert-row'), h.editor.getEditorState()).tableNode,
      9,
    );
  } finally {
    await h.editor.dispose();
  }
});
test('absent and non-true optional capability reject, readonly retains write policy', async () => {
  for (const available of [undefined, null, false, 'unknown']) {
    const h = await setup({ available });
    try {
      const r = await h.editor.dispatchCommand(EDIT_SOURCE_TABLE_GRID_COMMAND, request());
      assert.equal(r.error, 'SourceTableGridUnavailable');
      assert.equal(
        h.calls.some((c) => c.kind === 'source-table-grid'),
        false,
      );
    } finally {
      await h.editor.dispose();
    }
  }
  const h = await setup({ readonly: true });
  try {
    const before = h.editor.getEditorState();
    const r = await h.editor.dispatchCommand(EDIT_SOURCE_TABLE_GRID_COMMAND, request());
    assert.equal(r.error, 'ReadOnlyDocument');
    assert.equal(h.editor.getEditorState(), before);
    assert.equal((before.capabilities as any).sourceTableGridAvailable, false);
  } finally {
    await h.editor.dispose();
  }
});
test('dispatch captures owned payload and rejects second queued stale revision', async () => {
  const h = await setup();
  try {
    const payload = request(),
      a = h.editor.dispatchCommand(EDIT_SOURCE_TABLE_GRID_COMMAND, payload);
    payload.tableNode = 10;
    const b = h.editor.dispatchCommand(EDIT_SOURCE_TABLE_GRID_COMMAND, request());
    assert.equal((await a).status, 'committed-with-snapshot');
    assert.equal((await b).error, 'StaleTarget');
    assert.equal(h.calls.filter((c) => c.kind === 'source-table-grid').length, 1);
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
          { kind: 'source-table-grid', ...request() },
          {
            token: { ...token, ...delta },
            coordinates: 'legacy-native',
          },
        ),
        /StaleTarget/,
      );
    const result = await lease.request(
      { kind: 'source-table-grid', ...request() },
      { token, coordinates: 'legacy-native' },
    );
    assert.equal((result as any).status, 'committed-with-snapshot');
    assert.equal(h.calls.filter((c) => c.kind === 'source-table-grid').length, 1);
  } finally {
    lease.release();
    await h.editor.dispose();
  }
});
test('post-application projection failure preserves dirty committed classification', async () => {
  const h = await setup({ projectionError: true });
  try {
    const before = h.editor.getEditorState();
    const r = await h.editor.dispatchCommand(EDIT_SOURCE_TABLE_GRID_COMMAND, request());
    assert.equal(r.status, 'committed-refresh-required');
    assert.equal(r.error, 'ProjectionFailed');
    assert.equal(h.editor.getEditorState().operationRevision, before.operationRevision + 1);
    const retry = await h.editor.dispatchCommand(EDIT_SOURCE_TABLE_GRID_COMMAND, request());
    assert.equal(retry.error, 'RefreshRequired');
    assert.equal(h.calls.filter((c) => c.kind === 'source-table-grid').length, 1);
  } finally {
    await h.editor.dispose();
  }
});
test('same command name with different symbol cannot bypass admission', async () => {
  const h = await setup();
  try {
    assert.equal(
      (await h.editor.dispatchCommand(createCommand('source-table-grid'), request())).error,
      'UnsupportedCommand',
    );
  } finally {
    await h.editor.dispose();
  }
});
test('Worker helper supports all actions and old ABI is rejected before mutation', () => {
  const calls: unknown[] = [];
  const editor = {
    supportsSourceTableGrid: () => true,
    editSourceTableGrid: (r: unknown) => calls.push(r),
  };
  for (const action of ['insert-row', 'delete-row', 'insert-column', 'delete-column'] as const) {
    applySourceTableGridCommand(editor, 'hwp5', true, {
      kind: 'source-table-grid',
      origin: 'canvas',
      ...request(action),
    });
    applySourceTableGridCommand(editor, 'hwpx', true, request(action));
  }
  assert.equal(calls.length, 8);
  assert.deepEqual({ ...(calls[0] as object) }, request());
  for (const supportsSourceTableGrid of [undefined, () => false])
    assert.throws(
      () =>
        applySourceTableGridCommand(
          { ...editor, supportsSourceTableGrid },
          'hwpx',
          true,
          request(),
        ),
      /SourceTableGridUnavailable/,
    );
  assert.throws(
    () => applySourceTableGridCommand(editor, 'hwpx', false, request()),
    /EditorNotOpen/,
  );
  assert.equal(calls.length, 8);
});

test('Worker helper captures descriptors without invoking message getters', () => {
  let calls = 0;
  const editor = {
    supportsSourceTableGrid: () => true,
    editSourceTableGrid() {
      calls++;
    },
  };
  for (const key of [...Object.keys(request()), 'layout']) {
    const message = { ...request() };
    Object.defineProperty(message, key, {
      enumerable: true,
      get() {
        throw Error('GetterInvoked');
      },
    });
    assert.throws(
      () => applySourceTableGridCommand(editor, 'hwp5', true, message),
      /InvalidSourceTableGridRequest/,
    );
  }
  assert.equal(calls, 0);
});

test('surface cannot bypass an absent source capability', async () => {
  const h = await setup({ available: false });
  const lease = h.editor.acquireInputSurface({
    commitComposition: () => 'unchanged',
    cancelComposition() {},
  });
  try {
    const result = await lease.request(
      { kind: 'source-table-grid', ...request() },
      { token: h.editor.getEditorState().token, coordinates: 'legacy-native' },
    );
    assert.equal((result as any).error, 'SourceTableGridUnavailable');
    assert.equal(
      h.calls.some((c) => c.kind === 'source-table-grid'),
      false,
    );
  } finally {
    lease.release();
    await h.editor.dispose();
  }
});

test('Core and Worker reject all numeric wire action codes before runtime or SDK mutation', async () => {
  const h = await setup();
  let edits = 0;
  const sdk = {
    supportsSourceTableGrid: () => true,
    editSourceTableGrid() {
      edits++;
    },
  };
  try {
    for (const action of [0, 1, 2, 3]) {
      const payload = { ...request(), action };
      assert.throws(
        () => sourceTableGridMessage(payload as any, h.editor.getEditorState()),
        /InvalidSourceTableGridAction/,
      );
      assert.throws(
        () => h.editor.dispatchCommand(EDIT_SOURCE_TABLE_GRID_COMMAND, payload as any),
        /InvalidSourceTableGridAction/,
      );
      for (const format of ['hwp5', 'hwpx'])
        assert.throws(
          () => applySourceTableGridCommand(sdk, format, true, payload),
          /InvalidSourceTableGridAction/,
        );
    }
    assert.equal(edits, 0);
    assert.equal(
      h.calls.some((c) => c.kind === 'source-table-grid'),
      false,
    );
  } finally {
    await h.editor.dispose();
  }
});
