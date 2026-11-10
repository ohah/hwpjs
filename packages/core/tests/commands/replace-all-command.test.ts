import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, REPLACE_ALL_COMMAND } from '../../src/index.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';
const content = () => ({
  format: 'hwpx',
  totalParagraphs: 1,
  limited: false,
  paragraphs: [
    { section: 0, paragraph: 0, text: 'ab😀ab', editable: true, selectionOwner: 'section:0:body' },
  ],
});
async function harness(options: any = {}) {
  const calls: any[] = [];
  let closed = false;
  const runtime: any = {
    async request(message: any, context: any) {
      calls.push(message);
      const base = {
        kind: message.kind,
        historyRevision: 0,
        meta: { context, application: 'unapplied', changed: false },
      };
      if (message.kind === 'text-transaction-capabilities')
        return {
          ...base,
          textTransactionCapabilities: options.cap ?? { available: true, supportsNewlines: false },
        };
      if (message.kind === 'prepare-replace-all') {
        if (options.prepareError) return { ...base, error: options.prepareError };
        return {
          ...base,
          textTransaction: {
            schemaVersion: 1,
            binding: { session: 's', revision: 0 },
            scope: 'complete-current-paragraph-snapshot',
            groups: [{ ref: 'native' }],
          },
        };
      }
      if (message.kind === 'independent-text') return { ...base, ...options.reply };
      return { ...base, content: content() };
    },
    dispose() {
      closed = true;
    },
  };
  bindRuntimeAdmission(
    runtime,
    async (m, c, admit) => {
      if (m.kind === 'independent-text' && options.beforeMutation) options.beforeMutation();
      admit();
      return runtime.request(m, c);
    },
    () => !closed,
  );
  const editor = createEditor({ runtimeFactory: () => runtime });
  await editor.load(new Uint8Array([1]), { format: 'hwpx', editable: options.editable !== false });
  return { editor, calls };
}
const request = (editor: any, change: any = {}) => {
  const s = editor.getEditorState();
  return {
    schemaVersion: 1,
    query: 'ab',
    replacement: 'Z',
    layoutToken: s.token,
    stateVersion: s.stateVersion,
    ...change,
  };
};
test('Core sends one complete plan and one Native batch, never per-match splices', async () => {
  const h = await harness({
    reply: {
      formattingNativeCode: 1,
      changed: true,
      meta: undefined,
      applied: true,
      content: { ...content(), paragraphs: [{ ...content().paragraphs[0], text: 'Z😀Z' }] },
      historyRevision: 1,
    },
  });
  try {
    const result = await h.editor.dispatchCommand(REPLACE_ALL_COMMAND, request(h.editor));
    assert.equal(result.status, 'committed-with-snapshot');
    const prepares = h.calls.filter((m) => m.kind === 'prepare-replace-all');
    assert.equal(prepares.length, 1);
    assert.equal(prepares[0].plan.edits.length, 2);
    assert.equal(h.calls.filter((m) => m.kind === 'independent-text').length, 1);
    assert.equal(h.calls.filter((m) => m.kind === 'splice').length, 0);
    assert.equal((result.state.content as any).paragraphs[0].text, 'Z😀Z');
  } finally {
    await h.editor.dispose();
  }
});
test('no match still prepares full coverage and never invokes mutation', async () => {
  const h = await harness();
  try {
    const result = await h.editor.dispatchCommand(
      REPLACE_ALL_COMMAND,
      request(h.editor, { query: 'absent' }),
    );
    assert.equal(result.status, 'known-no-op');
    assert.equal(h.calls.filter((m) => m.kind === 'prepare-replace-all').length, 1);
    assert.equal(h.calls.filter((m) => m.kind === 'independent-text').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('Native preflight rejection preserves ready state and does not dispatch a partial batch', async () => {
  const h = await harness({ prepareError: 'IncompleteTextTransactionCoverage' });
  try {
    const result = await h.editor.dispatchCommand(REPLACE_ALL_COMMAND, request(h.editor));
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(result.state.status, 'ready');
    assert.equal(h.calls.filter((m) => m.kind === 'independent-text').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
for (const [code, status, error] of [
  [0, 'rejected-unapplied', 'TextTransactionExpectedMismatch'],
  [2, 'known-no-op', undefined],
] as const)
  test(`Native code ${code} retains definite rejection or no-op instead of ambiguous completion`, async () => {
    const h = await harness({ reply: { formattingNativeCode: code, error } });
    try {
      const result = await h.editor.dispatchCommand(REPLACE_ALL_COMMAND, request(h.editor));
      assert.equal(result.status, status);
      assert.equal(result.state.status, 'ready');
      assert.equal(h.calls.filter((m) => m.kind === 'independent-text').length, 1);
    } finally {
      await h.editor.dispose();
    }
  });
test('post-commit projection failure requires refresh and never retries Native', async () => {
  const h = await harness({
    reply: {
      applied: true,
      meta: undefined,
      error: 'ProjectionFailed',
      changed: true,
      formattingNativeCode: 1,
    },
  });
  try {
    const result = await h.editor.dispatchCommand(REPLACE_ALL_COMMAND, request(h.editor));
    assert.equal(result.status, 'committed-refresh-required');
    assert.equal(result.state.status, 'refresh-required');
    assert.equal(h.calls.filter((m) => m.kind === 'independent-text').length, 1);
  } finally {
    await h.editor.dispose();
  }
});
test('stale stateVersion is rejected before even querying Native', async () => {
  const h = await harness();
  try {
    const result = await h.editor.dispatchCommand(
      REPLACE_ALL_COMMAND,
      request(h.editor, { stateVersion: 0 }),
    );
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(h.calls.filter((m) => m.kind === 'prepare-replace-all').length, 0);
  } finally {
    await h.editor.dispose();
  }
});

test('capability uses admitted Native observation without granting a mutation', async () => {
  const h = await harness();
  try {
    const cap = await h.editor.getReplaceAllCapabilities();
    assert.deepEqual({ ...cap }, { available: true, supportsNewlines: false });
    assert(Object.isFrozen(cap));
    assert.equal(h.calls.filter((m) => m.kind === 'text-transaction-capabilities').length, 1);
    assert.equal(h.calls.filter((m) => m.kind === 'independent-text').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('unavailable Native capability remains an ordinary observation', async () => {
  const h = await harness({
    cap: { available: false, reason: 'HistoryProtocolRequired', supportsNewlines: false },
  });
  try {
    assert.equal((await h.editor.getReplaceAllCapabilities()).available, false);
    assert.equal(h.editor.getEditorState().status, 'ready');
  } finally {
    await h.editor.dispose();
  }
});

test('read-only host capability is disabled before Native query', async () => {
  const h = await harness({ editable: false });
  try {
    const cap = await h.editor.getReplaceAllCapabilities();
    assert.equal(cap.available, false);
    assert.equal(cap.reason, 'ReadOnlyDocument');
    assert.equal(h.calls.filter((m) => m.kind === 'text-transaction-capabilities').length, 0);
    const result = await h.editor.dispatchCommand(REPLACE_ALL_COMMAND, request(h.editor));
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(h.calls.filter((m) => m.kind === 'independent-text').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('capability rejects stale explicit token and unknown options without Native RPC', async () => {
  const h = await harness();
  try {
    const token = { ...h.editor.getEditorState().token, viewRevision: 999 };
    await assert.rejects(h.editor.getReplaceAllCapabilities({ token }), /StaleTarget/);
    assert.throws(
      () => h.editor.getReplaceAllCapabilities({ stateVersion: 1 } as any),
      /InvalidReplaceAllCapabilityOptions/,
    );
    assert.equal(h.calls.filter((m) => m.kind === 'text-transaction-capabilities').length, 0);
    assert.equal(h.editor.getEditorState().status, 'ready');
  } finally {
    await h.editor.dispose();
  }
});
