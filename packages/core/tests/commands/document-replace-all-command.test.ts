import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, REPLACE_ALL_COMMAND } from '../../src/index.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';

async function harness(options: any = {}) {
  const calls: any[] = [];
  const content = {
    format: 'hwp5',
    limited: true,
    window: { offset: 50, count: 1 },
    totalParagraphs: 8,
    paragraphs: [
      {
        section: 0,
        paragraph: 50,
        text: '가나다',
        editable: true,
        selectionOwner: 'section:0:body',
      },
    ],
  };
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
          textTransactionCapabilities: {
            available: true,
            supportsNewlines: false,
            documentScope: options.documentScope ?? true,
          },
        };
      if (message.kind === 'document-text-snapshot')
        return {
          ...base,
          documentText: {
            schemaVersion: 1,
            scope: 'native-document-text',
            complete: true,
            format: 'hwp5',
            binding: { session: 'native', revision: 0 },
            coverage: { totalParagraphs: 8, sections: [{ section: 0, paragraphCount: 8 }] },
            rows: Array.from({ length: 8 }, (_, ordinal) => ({
              ordinal,
              section: 0,
              paragraph: ordinal,
              ref: `d1-${ordinal}`,
              text: '가나다',
              editable: false,
            })),
          },
        };
      if (message.kind === 'replace-document-text')
        return {
          ...base,
          historyRevision: 1,
          content,
          meta: { context, application: 'applied', changed: true },
          ...options.mutation,
        };
      return { ...base, content };
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
  await editor.load(new Uint8Array([1]), { format: 'hwp5', editable: options.editable !== false });
  const request = (patch: any = {}) => {
    const state = editor.getEditorState();
    return {
      schemaVersion: 1,
      layoutToken: state.token,
      stateVersion: state.stateVersion,
      query: '가나다',
      replacement: '둘',
      ...patch,
    };
  };
  return { editor, calls, request };
}
test('actual Core command admits one complete Native transaction despite a clipped display', async () => {
  const h = await harness();
  try {
    assert.equal((await h.editor.getReplaceAllCapabilities()).documentScope, true);
    const result = await h.editor.dispatchCommand(REPLACE_ALL_COMMAND, h.request());
    assert.equal(result.status, 'committed-with-snapshot');
    const mutations = h.calls.filter((m) => m.kind === 'replace-document-text');
    assert.equal(mutations.length, 1);
    assert.equal(Object.getPrototypeOf(mutations[0].request.binding), null);
    assert.deepEqual(
      { ...mutations[0].request, binding: { ...mutations[0].request.binding } },
      {
        schemaVersion: 1,
        scope: 'native-document-text',
        binding: { session: 'native', revision: 0 },
        query: '가나다',
        replacement: '둘',
      },
    );
    assert.equal(h.calls.filter((m) => m.kind === 'document-text-snapshot').length, 1);
    assert.equal(
      h.calls.filter((m) => ['prepare-replace-all', 'independent-text', 'splice'].includes(m.kind))
        .length,
      0,
    );
  } finally {
    await h.editor.dispose();
  }
});
test('Core retains no-match and identity preflight: only Native decides whether History changes', async () => {
  for (const patch of [{ query: '없음' }, { replacement: '가나다' }]) {
    const h = await harness({
      mutation: {
        historyRevision: 0,
        formattingNativeCode: 2,
        meta: { application: 'unapplied', changed: false },
      },
    });
    try {
      const before = h.editor.getEditorState();
      const result = await h.editor.dispatchCommand(REPLACE_ALL_COMMAND, h.request(patch));
      assert.equal(result.status, 'known-no-op');
      assert.equal(h.calls.filter((m) => m.kind === 'replace-document-text').length, 1);
      assert.equal(h.editor.getEditorState().operationRevision, before.operationRevision);
      assert.equal(h.editor.getEditorState().nativeHistoryRevision, 0);
    } finally {
      await h.editor.dispose();
    }
  }
});
test('late planner refusal never admits a partial Native mutation', async () => {
  const h = await harness();
  try {
    const result = await h.editor.dispatchCommand(
      REPLACE_ALL_COMMAND,
      h.request({ limits: { matches: 7 } }),
    );
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(h.calls.filter((m) => m.kind === 'document-text-snapshot').length, 1);
    assert.equal(h.calls.filter((m) => m.kind === 'replace-document-text').length, 0);
    assert.equal(h.editor.getEditorState().nativeHistoryRevision, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('legacy capability never treats a clipped display as complete', async () => {
  const h = await harness({ documentScope: false });
  try {
    const cap = await h.editor.getReplaceAllCapabilities();
    assert.equal(cap.available, false);
    assert.equal(cap.reason, 'IncompleteReplaceAllSnapshot');
    const result = await h.editor.dispatchCommand(REPLACE_ALL_COMMAND, h.request());
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(h.calls.filter((m) => m.kind === 'replace-document-text').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('readonly host cannot borrow full Native read admission as write admission', async () => {
  const h = await harness({ editable: false });
  try {
    assert.equal((await h.editor.getReplaceAllCapabilities()).reason, 'ReadOnlyDocument');
    const result = await h.editor.dispatchCommand(REPLACE_ALL_COMMAND, h.request());
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(h.calls.filter((m) => m.kind === 'replace-document-text').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
