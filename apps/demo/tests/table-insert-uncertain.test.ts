import * as core from '@hwpjs/core';
import { test, expect } from 'bun:test';
import { createTableInsertBridge } from '../src/table-insert-bridge.ts';
import { createTableInsertController } from '../src/table-insert-tool.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
const settle = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
test('controller: 같은문서refresh-required도commit경고를표시하고재시도창을닫음', async () => {
  const dom = documentFixture(),
    statuses: string[] = [];
  let calls = 0,
    focus = 0;
  const content = {
    format: 'hwpx',
    paragraphs: [
      { section: 0, paragraph: 0, text: 'ABC', editable: true, selectionOwner: 'section:0:body' },
    ],
    tableCreationAvailable: true,
    tableCreationResources: { paragraph: [0], character: [0], style: [0], border_fill: [0] },
  };
  const editor = core.createEditor({
    runtimeFactory: () => ({
      async request(message: any, context: any) {
        if (message.kind === 'insert-table') {
          calls++;
          return {
            kind: message.kind,
            error: 'ProjectionFailed',
            historyRevision: 1,
            meta: { context, application: 'applied', changed: true },
          };
        }
        return {
          kind: message.kind,
          content,
          historyRevision: 0,
          meta: { context, application: 'unapplied', changed: false },
        };
      },
      dispose() {},
    }),
  });
  await editor.load(new Uint8Array([1]), { format: 'hwpx', editable: true });
  await editor.setSelection(
    core.createParagraphSelection(editor.getEditorState(), {
      section: 0,
      paragraph: 0,
      startUnit: 0,
    }),
  );
  const controller = createTableInsertController({
    root: dom.root as any,
    bridge: createTableInsertBridge(editor, core),
    onStatus: (s) => statuses.push(s),
    onClose: () => {
      focus++;
    },
  });
  try {
    controller.open();
    fire(dom.role('table-insert'), 'click');
    await settle();
    expect(calls).toBe(1);
    expect(editor.getEditorState().status).toBe('refresh-required');
    expect(statuses.join()).toContain('다시 만들지 마세요');
    expect(dom.role('table-insert-dialog')).toBeUndefined();
    expect(focus).toBe(0);
    controller.open();
    expect(dom.role('table-insert-dialog')).toBeUndefined();
    expect(calls).toBe(1);
  } finally {
    controller.dispose();
    await editor.dispose();
  }
});
for (const boundary of ['other-document', 'dispose'] as const)
  test('controller: 늦은uncertain결과폐기 ' + boundary, async () => {
    const dom = documentFixture(),
      statuses: string[] = [];
    let focus = 0,
      calls = 0;
    let state: any = { editorId: 'e', documentId: 'a', generation: 1, status: 'ready' },
      listener: () => void = () => {},
      resolve!: (value: any) => void;
    const bridge: any = {
      capture: () => ({ state, target: {}, resources: {}, reason: null }),
      presentation: () => ({ enabled: true }),
      subscribe: (fn: any) => {
        listener = fn;
        return () => {
          listener = () => {};
        };
      },
      insert: () => {
        calls++;
        return new Promise((r) => {
          resolve = r;
        });
      },
      dispose() {},
    };
    const controller = createTableInsertController({
      root: dom.root as any,
      bridge,
      onStatus: (s) => statuses.push(s),
      onClose: () => {
        focus++;
      },
    });
    try {
      controller.open();
      fire(dom.role('table-insert'), 'click');
      expect(calls).toBe(1);
      if (boundary === 'dispose') controller.dispose();
      else {
        state = { ...state, documentId: 'b', generation: 2 };
        listener();
      }
      resolve({ status: 'committed-refresh-required', error: 'ProjectionFailed' });
      await settle();
      expect(statuses).toEqual([]);
      expect(focus).toBe(0);
      expect(dom.role('table-insert-dialog')).toBeUndefined();
      expect(calls).toBe(1);
    } finally {
      controller.dispose();
    }
  });
