import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteInsertTool } from '../src/note-insert-tool.ts';
import { Document, all } from './fake-dom.mjs';
function setup({ available = true } = {}) {
  const doc = new Document();
  const original = doc.createElement.bind(doc);
  doc.createElement = (tag: string) => {
    const e = original(tag);
    if (tag === 'dialog') (e as any).showModal = () => (e.open = true);
    return e;
  };
  const root = doc.createElement('div');
  (root as any).querySelector = () =>
    all(root, (e: any) => e.tagName === 'DIALOG' && e.open)[0] ?? null;
  let state: any = {
    status: 'ready',
    nativeHistoryRevision: 0,
    nativeHistoryStats: { protocolVersion: 2 },
    content: {
      format: 'hwpx',
      inlineObjectPlacementVersion: 1,
      noteCreationAvailable: available,
      tableCreationResources: { paragraph: [7], character: [3], style: [11] },
      noteShapes: {
        sections: 2,
        notes: [
          { section_ordinal: 0, kind: 'foot' },
          { section_ordinal: 1, kind: 'end' },
        ],
      },
    },
  };
  const originalState = state;
  const target = { NativeOwner: 'exact' };
  const calls: any[] = [];
  const listeners = new Set<() => void>();
  const statuses: string[] = [];
  let captures = 0;
  const editor: any = {
    getEditorState: () => state,
    async getInlineObjectInsertTarget() {
      captures++;
      return target;
    },
    async dispatchCommand(command: any, payload: any) {
      calls.push({ command, payload });
      return { status: 'committed-with-snapshot' };
    },
    registerStateListener(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const capture: any = {
    state: originalState,
    selector: { section: 0, paragraph: 1 },
    unit: 1,
    expected_text: 'abc',
    current: () => state === originalState,
  };
  const tool = createNoteInsertTool({
    root: root as any,
    editor,
    captureCaret: () => capture,
    onStatus: (t) => statuses.push(t),
    onClose() {},
    onPresentationChange() {},
  });
  return {
    root,
    tool,
    calls,
    listeners,
    statuses,
    target,
    get captures() {
      return captures;
    },
    stale() {
      state = { ...state };
      for (const fn of listeners) fn();
    },
  };
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
for (const kind of ['foot', 'end'] as const)
  test(
    'demo ' + kind + ' uses native target, observed resources and missing-only policies once',
    async () => {
      const h = setup();
      assert.equal(h.tool.presentation().enabled, true);
      await h.tool.open(kind);
      const form: any = all(h.root, (e: any) => e.tagName === 'FORM')[0],
        body: any = all(h.root, (e: any) => e.tagName === 'TEXTAREA')[0];
      assert.ok(form);
      body.value = '\ufffc새😀\r\n\t';
      form.onsubmit(new Event('submit', { cancelable: true }));
      form.onsubmit(new Event('submit', { cancelable: true }));
      await flush();
      assert.equal(h.calls.length, 1);
      const p = h.calls[0].payload;
      assert.equal(p.target, h.target);
      assert.equal(p.options.body, body.value);
      assert.deepEqual(p.options.resources, { paragraph: 7, character: 3, style: 11 });
      assert.deepEqual(
        p.options.initial_policies.map((p: any) => p.section),
        [kind === 'foot' ? 1 : 0],
      );
      assert.equal(h.listeners.size, 0);
      h.tool.dispose();
    },
  );
test('demo stale state disables submission and disposal releases listener', async () => {
  const h = setup();
  await h.tool.open('foot');
  const form: any = all(h.root, (e: any) => e.tagName === 'FORM')[0];
  h.stale();
  form.onsubmit(new Event('submit', { cancelable: true }));
  await flush();
  assert.equal(h.calls.length, 0);
  h.tool.dispose();
  assert.equal(h.listeners.size, 0);
});
test('demo unsupported capability never queries target or opens a dialog', async () => {
  const h = setup({ available: false });
  assert.equal(h.tool.presentation().enabled, false);
  await h.tool.open('end');
  assert.equal(h.captures, 0);
  assert.equal(h.calls.length, 0);
  assert.equal(all(h.root, (e: any) => e.tagName === 'DIALOG').length, 0);
  h.tool.dispose();
});
