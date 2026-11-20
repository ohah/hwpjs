import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../src/editor/create-editor.ts';
import { findDocumentTextMatch } from '../../src/state/document-text-search.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';

async function harness(options: any = {}) {
  const calls: any[] = [];
  const runtimeFactory = () => {
    let retired = false;
    const runtime: any = {
      async request(message: any, context: any) {
        calls.push(message);
        const base = {
          kind: message.kind,
          historyRevision: 7,
          meta: { context, application: 'unapplied', changed: false },
        };
        if (message.kind === 'document-text-snapshot')
          return {
            ...base,
            documentText: {
              schemaVersion: 1,
              scope: 'native-document-text',
              complete: true,
              format: 'hwpx',
              binding: { session: 'native', revision: 7 },
              coverage: { totalParagraphs: 1, sections: [{ section: 0, paragraphCount: 1 }] },
              rows: [{ ordinal: 0, section: 0, paragraph: 0, ref: 'native-read', text: '앞😀뒤' }],
            },
          };
        if (message.kind === 'document-text-selection') {
          await options.duringRead?.();
          const value = {
            schemaVersion: 1,
            scope: message.request.scope,
            binding: message.request.binding,
            ref: message.request.ref,
            expectedOriginal: message.request.expectedOriginal,
            coordinateSpace: 'native-current-text-observation',
            executionAuthority: false,
            format: 'hwpx',
            beforeText: '앞😀뒤',
            target: { kind: 'paragraph', section: 0, paragraph: 91, startUnit: 1, endUnit: 3 },
          };
          options.mutate?.(value);
          return {
            ...base,
            documentTextSelection: value,
            ...(options.error ? { error: options.error } : {}),
          };
        }
        return {
          ...base,
          content: {
            format: 'hwpx',
            limited: true,
            window: { offset: 91, count: 1 },
            totalParagraphs: 92,
            paragraphs: [{ section: 0, paragraph: 91, text: 'visible', selectionOwner: 'body' }],
          },
        };
      },
      dispose() {
        retired = true;
      },
    };
    bindRuntimeAdmission(
      runtime,
      async (message, context, admit) => {
        admit();
        return runtime.request(message, context);
      },
      () => !retired,
    );
    return runtime;
  };
  const editor = createEditor({ runtimeFactory });
  await editor.load(new Uint8Array([1]), { format: 'hwpx', editable: options.editable !== false });
  const index = await editor.getDocumentTextSnapshot();
  const match = findDocumentTextMatch(index, '😀')!;
  return { editor, index, match, calls };
}
test('Core selection query uses FIFO read admission and actual Native address without moving the current window', async () => {
  const h = await harness();
  try {
    const before = h.editor.getEditorState();
    const result = await h.editor.getDocumentTextSelection(h.index, h.match);
    assert.equal(result.native.target.kind, 'paragraph');
    assert.equal((result.native.target as any).paragraph, 91);
    assert.equal(result.native.executionAuthority, false);
    assert.equal(h.editor.getEditorState(), before);
    assert.equal(Object.isFrozen(result.native.target), true);
    const request = h.calls.find((v) => v.kind === 'document-text-selection').request;
    assert.equal('paragraph' in request, false);
    assert.equal('target' in request, false);
    assert.equal(
      h.calls.some((v) => ['set-edit-window', 'independent-text', 'splice'].includes(v.kind)),
      false,
    );
  } finally {
    await h.editor.dispose();
  }
});
test('Core selection read remains available with host writes disabled', async () => {
  const h = await harness({ editable: false });
  try {
    assert.equal(
      (await h.editor.getDocumentTextSelection(h.index, h.match)).native.beforeText,
      '앞😀뒤',
    );
    assert.equal(
      h.calls.some((v) => v.kind === 'text-transaction-capabilities'),
      false,
    );
  } finally {
    await h.editor.dispose();
  }
});
test('Core rejects foreign index, stale state and forged match before Native selection request', async () => {
  const h = await harness();
  try {
    await assert.rejects(
      h.editor.getDocumentTextSelection({ ...h.index }, h.match),
      /InvalidDocumentTextIndex/,
    );
    for (const fields of [
      { ref: 'forged' },
      { expectedOriginal: '가나' },
      { ordinal: '0' },
      { paragraph: 91 },
      { executionAuthority: true },
    ])
      await assert.rejects(
        h.editor.getDocumentTextSelection(h.index, { ...h.match, ...fields } as any),
      );
    await h.editor.setSelection(null);
    await assert.rejects(
      h.editor.getDocumentTextSelection(h.index, h.match),
      /StaleDocumentTextSnapshot/,
    );
    assert.equal(h.calls.filter((v) => v.kind === 'document-text-selection').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('Core rejects stale or cross-section Native reply without replacing current content', async () => {
  for (const mutate of [
    (r: any) => {
      r.binding = { ...r.binding, revision: 6 };
    },
    (r: any) => {
      r.target.section = 1;
    },
    (r: any) => {
      r.ref = 'other';
    },
    (r: any) => {
      r.executionAuthority = true;
    },
    (r: any) => {
      r.target.startUnit = 2;
    },
  ]) {
    const h = await harness({ mutate });
    try {
      const before = h.editor.getEditorState();
      await assert.rejects(
        h.editor.getDocumentTextSelection(h.index, h.match),
        /InvalidDocumentTextSelectionObservation/,
      );
      assert.equal(h.editor.getEditorState(), before);
    } finally {
      await h.editor.dispose();
    }
  }
});
test('Core selected pending cell keeps string identity and cannot inherit paragraph fields from Runtime', async () => {
  const h = await harness({
    mutate(r: any) {
      r.target = {
        kind: 'created-cell',
        section: 0,
        identity: '18446744073709551615',
        row: 17,
        column: 31,
        startUnit: 1,
        endUnit: 3,
        paragraph: 91,
      };
    },
  });
  try {
    const result = await h.editor.getDocumentTextSelection(h.index, h.match);
    assert.equal(result.native.target.kind, 'created-cell');
    assert.equal((result.native.target as any).identity, '18446744073709551615');
    assert.equal('paragraph' in result.native.target, false);
  } finally {
    await h.editor.dispose();
  }
});
test('Core disposal during asynchronous selection read rejects late publication', async () => {
  let editor: any;
  const h = await harness({
    duringRead() {
      void editor.dispose();
    },
  });
  editor = h.editor;
  await assert.rejects(editor.getDocumentTextSelection(h.index, h.match), /EditorDisposed/);
});
test('Core reload rejects an earlier match even when text and Native revision are identical', async () => {
  const h = await harness();
  try {
    await h.editor.load(new Uint8Array([1]), { format: 'hwpx' });
    await assert.rejects(h.editor.getDocumentTextSelection(h.index, h.match));
    assert.equal(h.calls.filter((v) => v.kind === 'document-text-selection').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('Core accessor match fails without invoking getters or Native', async () => {
  const h = await harness();
  let reads = 0;
  try {
    assert.throws(() =>
      h.editor.getDocumentTextSelection(h.index, {
        ...h.match,
        get ref() {
          reads++;
          return 'forged';
        },
      }),
    );
    assert.equal(reads, 0);
    assert.equal(h.calls.filter((v) => v.kind === 'document-text-selection').length, 0);
  } finally {
    await h.editor.dispose();
  }
});

test('Core foreign index cannot run a token accessor before private index validation', async () => {
  const h = await harness();
  let reads = 0;
  try {
    const foreign: any = {
      get token() {
        reads++;
        return h.index.token;
      },
    };
    await assert.rejects(
      h.editor.getDocumentTextSelection(foreign, h.match),
      /InvalidDocumentTextIndex/,
    );
    assert.equal(reads, 0);
    assert.equal(h.calls.filter((v) => v.kind === 'document-text-selection').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
