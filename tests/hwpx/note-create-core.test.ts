import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditor,
  INSERT_FOOTNOTE_COMMAND,
  INSERT_ENDNOTE_COMMAND,
  createParagraphSelection,
  getNoteInsertAvailability,
} from '../../packages/core/src/index.ts';
import { bindRuntimeAdmission } from '../../packages/core/src/internal/runtime-admission.ts';
const options = () => ({
  body: '\ufffc새😀\r\n\t',
  resources: { paragraph: 0, character: 0, style: 0 },
  format: {
    number_type: 'DIGIT',
    user_char: '',
    prefix_char: '',
    suffix_char: ')',
    superscript: false,
  },
  initial_policies: [],
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
function harness({ mode = 'applied', available = true, delay = false } = {}) {
  const calls: any[] = [];
  let closed = false,
    cursor = 0,
    clock = 0;
  let rows: any[] = [{ revision: 0, body: null }];
  const entered = deferred(),
    release = deferred();
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
            expected_text: 'a😀b',
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
      if (['insert-footnote', 'insert-endnote'].includes(m.kind)) {
        if (mode === 'reject')
          return {
            ...base(),
            error: 'UnsupportedNoteCreatePolicy',
            meta: { context: c, application: 'unapplied', changed: false },
          };
        if (mode === 'unknown')
          return {
            ...base(),
            error: 'lost reply',
            meta: { context: c, application: 'unknown', changed: null },
          };
        rows = rows.slice(0, cursor + 1);
        rows.push({ revision: ++clock, body: m.request.body });
        cursor++;
      }
      if (m.kind === 'undo') cursor = Math.max(0, cursor - 1);
      if (m.kind === 'redo') cursor = Math.min(rows.length - 1, cursor + 1);
      const content = {
        format: 'hwpx',
        inlineObjectPlacementVersion: 1,
        noteCreationAvailable: available,
        paragraphs: [
          {
            section: 0,
            paragraph: 0,
            text: 'a😀b',
            editable: true,
            plainEditable: true,
            selectionOwner: 'section:0:body',
          },
          ...(current().body === null
            ? []
            : [
                {
                  section: 0,
                  paragraph: 1,
                  text: current().body,
                  editable: true,
                  plainEditable: true,
                  selectionOwner: 'note:0:1',
                },
              ]),
        ],
      };
      return {
        ...base(),
        content,
        ...(['insert-footnote', 'insert-endnote'].includes(m.kind) && mode !== 'missingCaret'
          ? {
              noteCaret: {
                section: 0,
                paragraph: 2,
                unit: current().body.length,
                coordinateSpace: 'plain',
              },
            }
          : {}),
      };
    },
    dispose() {
      closed = true;
    },
  };
  bindRuntimeAdmission(
    runtime as any,
    async (m, c, admit) => {
      if (delay && ['insert-footnote', 'insert-endnote'].includes(m.kind)) {
        entered.resolve();
        await release.promise;
      }
      admit();
      return runtime.request(m, c);
    },
    () => !closed,
  );
  const editor = createEditor({ runtimeFactory: () => runtime as any });
  return {
    editor,
    calls,
    entered,
    release,
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
      return { target, selectionVersion: editor.getEditorState().stateVersion, options: options() };
    },
  };
}
for (const command of [INSERT_FOOTNOTE_COMMAND, INSERT_ENDNOTE_COMMAND])
  test(
    command.name + ' mock single commit selects plain body and retains undo redo save',
    async () => {
      const h = harness();
      try {
        await h.open();
        const before = await h.editor.save();
        const p = await h.payload();
        const result = await h.editor.dispatchCommand(command, p);
        assert.equal(result.status, 'committed-with-snapshot');
        assert.equal((h.editor.getEditorState().selection as any)?.paragraph, 1);
        assert.equal(
          (h.editor.getEditorState().selection as any)?.startUnit,
          p.options.body.length,
        );
        assert.equal(h.editor.getEditorState().nativeHistoryRevision, 1);
        assert.equal(h.calls.filter((c) => c.kind === command.name).length, 1);
        const saved = await h.editor.save();
        await h.editor.dispatchCommand(
          (await import('../../packages/core/src/index.ts')).UNDO_COMMAND,
          { token: h.editor.getEditorState().token },
        );
        assert.deepEqual((await h.editor.save()).bytes, before.bytes);
        await h.editor.dispatchCommand(
          (await import('../../packages/core/src/index.ts')).REDO_COMMAND,
          { token: h.editor.getEditorState().token },
        );
        assert.deepEqual((await h.editor.save()).bytes, saved.bytes);
      } finally {
        await h.editor.dispose();
      }
    },
  );
test('note Core owns queued nested data and rejects second stale request', async () => {
  const h = harness({ delay: true });
  try {
    await h.open();
    const p = await h.payload();
    const first = h.editor.dispatchCommand(INSERT_FOOTNOTE_COMMAND, p);
    await h.entered.promise;
    p.options.resources.style = 99;
    p.options.body = 'changed';
    h.release.resolve();
    assert.equal((await first).status, 'committed-with-snapshot');
    assert.equal(h.calls.find((c) => c.kind === 'insert-footnote').request.resources.style, 0);
    assert.equal(h.calls.find((c) => c.kind === 'insert-footnote').request.body, options().body);
    const second = await h.editor.dispatchCommand(INSERT_FOOTNOTE_COMMAND, p);
    assert.equal(second.status, 'rejected-unapplied');
    assert.equal(h.calls.filter((c) => c.kind === 'insert-footnote').length, 1);
  } finally {
    await h.editor.dispose();
  }
});
test('note Core old capability refusal does not send mutation', async () => {
  const h = harness({ available: false });
  try {
    await h.open();
    assert.equal(getNoteInsertAvailability(h.editor.getEditorState()).enabled, false);
    const result = await h.editor.dispatchCommand(INSERT_ENDNOTE_COMMAND, await h.payload());
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(h.calls.filter((c) => c.kind === 'insert-endnote').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('note Core Native refusal retains state and missing committed caret requires refresh', async () => {
  for (const [mode, expected] of [
    ['reject', 'rejected-unapplied'],
    ['unknown', 'committed-refresh-required'],
    ['missingCaret', 'committed-refresh-required'],
  ]) {
    const h = harness({ mode });
    try {
      await h.open();
      const p = await h.payload();
      const before = h.editor.getEditorState();
      const result = await h.editor.dispatchCommand(INSERT_FOOTNOTE_COMMAND, p);
      assert.equal(result.status, expected);
      assert.equal(h.calls.filter((c) => c.kind === 'insert-footnote').length, 1);
      if (mode === 'reject') assert.equal(h.editor.getEditorState(), before);
    } finally {
      await h.editor.dispose();
    }
  }
});
