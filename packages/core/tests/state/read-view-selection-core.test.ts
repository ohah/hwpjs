// Actual Core view publication; controlled Runtime only, no Native/GUI claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../src/editor/create-editor.ts';
import { createParagraphSelection } from '../../src/state/paragraph-selection.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';
async function harness() {
  let closed = false,
    gate: (() => Promise<void>) | undefined;
  const runtime: any = {
    request: async (message: any, context: any) => {
      if (message.kind === 'refresh-document-text-view') await gate?.();
      return {
        kind: message.kind,
        meta: { context, application: 'unapplied', changed: false },
        content: {
          format: 'hwpx',
          paragraphs: [
            {
              section: 0,
              paragraph: 0,
              text: 'ab',
              editable: false,
              selectable: true,
              selectionOwner: 'section:0:body',
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
    async (m, c, admit) => {
      admit();
      return runtime.request(m, c);
    },
    () => !closed,
  );
  const editor = createEditor({ runtimeFactory: () => runtime });
  await editor.load(new Uint8Array([1]), { format: 'hwpx', editable: false });
  await editor.setSelection(
    createParagraphSelection(editor.getEditorState(), {
      section: 0,
      paragraph: 0,
      startUnit: 1,
      endUnit: 1,
    }),
  );
  const lease = editor.acquireInputSurface({
    commitComposition: () => 'unchanged',
    cancelComposition: () => {},
  });
  return {
    editor,
    lease,
    gate(fn: () => Promise<void>) {
      gate = fn;
    },
  };
}
test('actual Core read-view refresh preserves the readonly caret using the new view token', async () => {
  const h = await harness();
  try {
    const before = h.editor.getEditorState();
    await h.lease.request(
      { kind: 'refresh-document-text-view' },
      { coordinates: 'legacy-native', token: before.token },
    );
    const after = h.editor.getEditorState();
    assert.equal((after.selection as any)?.startUnit, 1);
    assert.equal((after.selection as any)?.viewRevision, after.viewRevision);
    assert.equal(after.operationRevision, before.operationRevision);
    assert.equal(after.nativeHistoryRevision, undefined);
  } finally {
    h.lease.release();
    await h.editor.dispose();
  }
});
test('released old lease cannot publish a delayed read-view reply or restore a stale caret', async () => {
  const h = await harness();
  try {
    let start!: () => void, finish!: () => void;
    const entered = new Promise<void>((r) => {
      start = r;
    });
    const done = new Promise<void>((r) => {
      finish = r;
    });
    h.gate(async () => {
      start();
      await done;
    });
    const before = h.editor.getEditorState(),
      pending = h.lease.request(
        { kind: 'refresh-document-text-view' },
        { coordinates: 'legacy-native', token: before.token },
      );
    await entered;
    h.lease.release();
    const released = h.editor.getEditorState();
    finish();
    await assert.rejects(pending);
    assert.equal(h.editor.getEditorState(), released);
  } finally {
    h.lease.release();
    await h.editor.dispose();
  }
});
