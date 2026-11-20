import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../src/editor/create-editor.ts';
import {
  findDocumentTextMatch,
  assertDocumentTextIndexCurrent,
} from '../../src/state/document-text-search.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';

async function harness(options: any = {}) {
  const calls: any[] = [];
  let disposed = false;
  const snapshot = () => ({
    schemaVersion: 1,
    scope: 'native-document-text',
    complete: true,
    format: 'hwpx',
    binding: { session: 'native', revision: 7 },
    coverage: { totalParagraphs: 3, sections: [{ section: 0, paragraphCount: 3 }] },
    rows: ['offscreen header needle', 'visible', 'offscreen created cell needle'].map(
      (text, ordinal) => ({
        ordinal,
        section: 0,
        paragraph: ordinal,
        ref: `native-read-${ordinal}`,
        text,
      }),
    ),
  });
  const runtime: any = {
    async request(message: any, context: any) {
      calls.push(message);
      const base = {
        kind: message.kind,
        historyRevision: 7,
        meta: { context, application: 'unapplied', changed: false },
      };
      if (message.kind === 'document-text-snapshot') {
        await options.duringRead?.();
        return {
          ...base,
          documentText: options.snapshot ?? snapshot(),
          ...(options.error ? { error: options.error } : {}),
        };
      }
      return {
        ...base,
        content: {
          format: 'hwpx',
          window: { offset: 1, count: 1 },
          totalParagraphs: 3,
          limited: true,
          paragraphs: [
            { section: 0, paragraph: 1, text: 'visible', selectionOwner: 'section:0:body' },
          ],
        },
      };
    },
    dispose() {
      disposed = true;
    },
  };
  bindRuntimeAdmission(
    runtime,
    async (message, context, admit) => {
      admit();
      return runtime.request(message, context);
    },
    () => !disposed,
  );
  const editor = createEditor({ runtimeFactory: () => runtime });
  await editor.load(new Uint8Array([1]), { format: 'hwpx', editable: options.editable !== false });
  return { editor, calls, snapshot };
}
test('Core complete-text read uses the existing FIFO/admission without replacing the current window or creating history', async () => {
  const h = await harness();
  try {
    const before = h.editor.getEditorState();
    const index = await h.editor.getDocumentTextSnapshot();
    assert.equal(findDocumentTextMatch(index, 'needle')?.ref, 'native-read-0');
    assert.equal(
      findDocumentTextMatch(index, 'needle', { direction: 'backward' })?.ref,
      'native-read-2',
    );
    assert.equal(h.editor.getEditorState(), before);
    assert.equal(h.calls.filter((v) => v.kind === 'document-text-snapshot').length, 1);
    assert.equal(
      h.calls.filter((v) => ['independent-text', 'splice', 'set-edit-window'].includes(v.kind))
        .length,
      0,
    );
  } finally {
    await h.editor.dispose();
  }
});
test('Core allows full text reads in read-only hosts and does not ask for a write capability', async () => {
  const h = await harness({ editable: false });
  try {
    const index = await h.editor.getDocumentTextSnapshot();
    assert.equal(findDocumentTextMatch(index, 'needle')?.ordinal, 0);
    assert.equal(h.calls.filter((v) => v.kind === 'text-transaction-capabilities').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('Native read rejection, wrong binding and incomplete read never publish a partial snapshot', async () => {
  for (const options of [{ error: 'NativeReadRejected' }, { snapshot: {} }]) {
    const h = await harness(options);
    try {
      const before = h.editor.getEditorState();
      await assert.rejects(h.editor.getDocumentTextSnapshot());
      assert.equal(h.editor.getEditorState(), before);
    } finally {
      await h.editor.dispose();
    }
  }
  const h = await harness();
  try {
    const stale = h.snapshot();
    stale.binding.revision = 6;
    const other = await harness({ snapshot: stale });
    try {
      await assert.rejects(
        other.editor.getDocumentTextSnapshot(),
        /IncompleteDocumentTextSnapshot/,
      );
    } finally {
      await other.editor.dispose();
    }
  } finally {
    await h.editor.dispose();
  }
});
test('selection changes retire an acquired index and disposal during Native read prevents a late result', async () => {
  const h = await harness();
  try {
    const index = await h.editor.getDocumentTextSnapshot();
    await h.editor.setSelection(null);
    assert.throws(
      () => assertDocumentTextIndexCurrent(index, h.editor.getEditorState()),
      /StaleDocumentTextSnapshot/,
    );
  } finally {
    await h.editor.dispose();
  }
  let editor: any;
  const late = await harness({
    duringRead: async () => {
      void editor.dispose();
    },
  });
  editor = late.editor;
  await assert.rejects(editor.getDocumentTextSnapshot(), /EditorDisposed/);
});
test('stale requested token and accessor options fail before a Native read', async () => {
  const h = await harness();
  try {
    const token = h.editor.getEditorState().token;
    await assert.rejects(
      h.editor.getDocumentTextSnapshot({ token: { ...token, generation: token.generation + 1 } }),
    );
    let reads = 0;
    assert.throws(() =>
      h.editor.getDocumentTextSnapshot({
        get token() {
          reads++;
          return token;
        },
      }),
    );
    assert.equal(reads, 0);
    assert.equal(h.calls.filter((v) => v.kind === 'document-text-snapshot').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
