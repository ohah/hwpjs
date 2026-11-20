import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditor,
  DELETE_NOTE_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  createParagraphSelection,
} from '../../packages/core/src/index.ts';
import { bindRuntimeAdmission } from '../../packages/core/src/internal/runtime-admission.ts';
function harness({ available = true, mode = 'applied', delay = false } = {}) {
  const calls: any[] = [];
  let cursor = 0,
    closed = false;
  let rows = [{ revision: 0, deleted: false }];
  let entered!: () => void, release!: () => void;
  const waiting = new Promise<void>((r) => (entered = r)),
    barrier = new Promise<void>((r) => (release = r));
  const runtime: any = {
    async request(m: any, c: any) {
      calls.push(structuredClone(m));
      const current = () => rows[cursor];
      const base = () => ({
        kind: m.kind,
        historyRevision: current().revision,
        historyStats: { protocolVersion: 2 },
        historyRevisions: rows.map((r) => r.revision),
        meta: { context: c, application: 'applied', changed: true },
      });
      if (m.kind === 'inline-object-owner')
        return {
          ...base(),
          inlineObjectOwner: {
            schemaVersion: 1,
            section: 0,
            paragraph: 1,
            expected_text: 'a\ufffc😀',
            owner: {
              kind: 'body',
              binding: {
                session: 's1',
                revision: current().revision,
                serial: String(current().revision),
              },
            },
          },
        };
      if (m.kind === 'save')
        return { ...base(), bytes: new TextEncoder().encode(JSON.stringify(current())) };
      if (m.kind === 'delete-note') {
        if (mode === 'reject')
          return {
            ...base(),
            error: 'UnsupportedNoteDeleteBody',
            meta: { context: c, application: 'unapplied', changed: false },
          };
        if (mode === 'unknown')
          return {
            ...base(),
            error: 'lost',
            meta: { context: c, application: 'unknown', changed: null },
          };
        rows = rows.slice(0, cursor + 1);
        rows.push({ revision: rows.length, deleted: true });
        cursor++;
      }
      if (m.kind === 'undo') cursor = Math.max(0, cursor - 1);
      if (m.kind === 'redo') cursor = Math.min(rows.length - 1, cursor + 1);
      return {
        ...base(),
        content: {
          format: 'hwpx',
          inlineObjectPlacementVersion: 1,
          noteDeletionAvailable: available,
          paragraphs: [
            {
              section: 0,
              paragraph: 0,
              text: current().deleted ? 'a😀' : 'a\ufffc😀',
              editable: true,
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
      if (delay && m.kind === 'delete-note') {
        entered();
        await barrier;
      }
      admit();
      return runtime.request(m, c);
    },
    () => !closed,
  );
  const editor = createEditor({ runtimeFactory: () => runtime });
  return {
    editor,
    calls,
    waiting,
    release: () => release(),
    async open() {
      await editor.load(new Uint8Array([1]), { format: 'hwpx' });
      await editor.setSelection(
        createParagraphSelection(editor.getEditorState(), {
          section: 0,
          paragraph: 0,
          startUnit: 1,
        }),
      );
    },
    async payload() {
      const target = await editor.getInlineObjectInsertTarget({ section: 0, paragraph: 1 }, 1);
      return { target, selectionVersion: editor.getEditorState().stateVersion };
    },
  };
}
test('note delete Core single history edge clears deleted selection and preserves undo redo bytes', async () => {
  const h = harness();
  try {
    await h.open();
    const before = await h.editor.save();
    const result = await h.editor.dispatchCommand(DELETE_NOTE_COMMAND, await h.payload());
    assert.equal(result.status, 'committed-with-snapshot');
    assert.equal(h.editor.getEditorState().nativeHistoryRevision, 1);
    assert.equal(h.editor.getEditorState().selection, undefined);
    assert.equal(h.calls.filter((m) => m.kind === 'delete-note').length, 1);
    const after = await h.editor.save();
    await h.editor.dispatchCommand(UNDO_COMMAND, { token: h.editor.getEditorState().token });
    assert.deepEqual((await h.editor.save()).bytes, before.bytes);
    await h.editor.dispatchCommand(REDO_COMMAND, { token: h.editor.getEditorState().token });
    assert.deepEqual((await h.editor.save()).bytes, after.bytes);
  } finally {
    await h.editor.dispose();
  }
});
test('note delete Core unavailable refuses without mutation', async () => {
  const h = harness({ available: false });
  try {
    await h.open();
    const r = await h.editor.dispatchCommand(DELETE_NOTE_COMMAND, await h.payload());
    assert.equal(r.status, 'rejected-unapplied');
    assert.equal(h.calls.filter((m) => m.kind === 'delete-note').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
for (const [mode, status] of [
  ['reject', 'rejected-unapplied'],
  ['unknown', 'committed-refresh-required'],
])
  test('note delete Core ' + mode + ' preserves outcome without replay', async () => {
    const h = harness({ mode });
    try {
      await h.open();
      const p = await h.payload();
      const r = await h.editor.dispatchCommand(DELETE_NOTE_COMMAND, p);
      assert.equal(r.status, status);
      assert.equal(h.calls.filter((m) => m.kind === 'delete-note').length, 1);
      assert.equal(h.editor.getEditorState().nativeHistoryRevision, 0);
    } finally {
      await h.editor.dispose();
    }
  });
test('note delete Core queued payload owned and second stale request never mutates', async () => {
  const h = harness({ delay: true });
  try {
    await h.open();
    const p = structuredClone(await h.payload());
    const first = h.editor.dispatchCommand(DELETE_NOTE_COMMAND, p);
    await h.waiting;
    const second = h.editor.dispatchCommand(DELETE_NOTE_COMMAND, p);
    assert.equal(Reflect.set(p.target.address, 'expected_text', 'changed'), true);
    assert.equal(Reflect.set(p.target.address.owner.binding, 'serial', '99'), true);
    h.release();
    assert.equal((await first).status, 'committed-with-snapshot');
    assert.equal((await second).status, 'rejected-unapplied');
    const sent = h.calls.filter((m) => m.kind === 'delete-note');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].request.target.expected_text, 'a\ufffc😀');
    assert.equal(sent[0].request.target.owner.binding.serial, '0');
  } finally {
    await h.editor.dispose();
  }
});
test('note delete Core experimental bypass is refused', async () => {
  const h = harness();
  try {
    await h.open();
    assert.throws(
      () =>
        h.editor.requestExperimental(
          { kind: 'delete-note', request: {} },
          { mutation: true, token: h.editor.getEditorState().token },
        ),
      /UseTypedEditorOperation/,
    );
  } finally {
    await h.editor.dispose();
  }
});
