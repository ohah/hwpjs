import { test, expect } from 'bun:test';
import * as core from '../../../packages/core/src/index.ts';
import { createTableInsertBridge } from '../src/table-insert-bridge.ts';
import { createTableInsertController } from '../src/table-insert-tool.ts';
import { documentFixture } from './formatting-dialog-test-dom.ts';

const draft = { rows: '2', columns: '2', widthPoints: '360', rowHeightPoints: '18' };
async function setup(format = 'hwp5', generated = false) {
  const messages: any[] = [],
    errors: any[] = [];
  const content = {
    format,
    tableCreationAvailable: true,
    tableCreationResources: { paragraph: [0], character: [0], style: [0], border_fill: [0] },
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: '',
        editable: true,
        selectionOwner: 'section:0:body',
        ...(format === 'hwp5'
          ? {
              currentReference: {
                epoch: '3',
                kind: generated ? 'generated' : 'original',
                section: 0,
                id: generated ? '3' : '0',
                row: 0,
                column: 0,
                scope: 'fixture',
              },
            }
          : {}),
      },
    ],
  };
  const editor = core.createEditor({
    onError: (e) => errors.push(e),
    runtimeFactory: () => ({
      async request(m: any, context: any) {
        messages.push(m);
        return {
          kind: m.kind,
          content,
          meta: { context, application: 'unapplied', changed: false },
        };
      },
      dispose() {},
    }),
  });
  await editor.load(new Uint8Array([1]), { format: format as 'hwp5' | 'hwpx', editable: true });
  await editor.setSelection(
    core.createParagraphSelection(editor.getEditorState(), {
      section: 0,
      paragraph: 0,
      startUnit: 0,
    }),
  );
  return { editor, messages, errors, content };
}

test('generated HWP5 target is disabled with Korean reason before Core dispatch or modal creation', async () => {
  const f = await setup('hwp5', true),
    bridge = createTableInsertBridge(f.editor, core),
    dom = documentFixture(),
    statuses: string[] = [];
  const controller = createTableInsertController({
    root: dom.root as any,
    bridge,
    onStatus: (m) => statuses.push(m),
    onClose() {},
  });
  try {
    const before = f.editor.getEditorState(),
      capture = bridge.capture();
    expect(capture.reason).not.toBeNull();
    expect(capture.reason).toMatch(/[가-힣]/);
    expect(bridge.presentation().enabled).toBe(false);
    expect((await bridge.insert(capture, draft)).status).toBe('rejected-unapplied');
    controller.open();
    expect(dom.role('table-insert-dialog')).toBeUndefined();
    expect(statuses.join()).toMatch(/[가-힣]/);
    expect(f.messages.filter((m) => m.kind === 'insert-table')).toEqual([]);
    expect(f.errors).toEqual([]);
    expect(f.editor.getEditorState()).toBe(before);
  } finally {
    controller.dispose();
    await f.editor.dispose();
  }
});
for (const format of ['hwp5', 'hwpx'])
  test(`${format} supported original target remains available with same public SDK query`, async () => {
    const f = await setup(format),
      bridge = createTableInsertBridge(f.editor, core);
    try {
      expect(bridge.capture().reason).toBeNull();
      expect(bridge.presentation().enabled).toBe(true);
    } finally {
      bridge.dispose();
      await f.editor.dispose();
    }
  });
test('old SDK without target query fails closed and cannot dispatch', async () => {
  const f = await setup('hwpx');
  const bridge = createTableInsertBridge(f.editor, {
    INSERT_TABLE_COMMAND: core.INSERT_TABLE_COMMAND,
    getSelectionFormatting: core.getSelectionFormatting,
  });
  try {
    const capture = bridge.capture();
    expect(capture.reason).toBe('TableInsertApiUnavailable');
    expect((await bridge.insert(capture, draft)).status).toBe('rejected-unapplied');
    expect(f.messages.filter((m) => m.kind === 'insert-table')).toEqual([]);
    expect(f.errors).toEqual([]);
  } finally {
    bridge.dispose();
    await f.editor.dispose();
  }
});
test('existing stale capture fence remains in front of dispatch', async () => {
  const f = await setup('hwpx'),
    bridge = createTableInsertBridge(f.editor, core);
  try {
    const capture = bridge.capture();
    await f.editor.setSelection(null);
    expect((await bridge.insert(capture, draft)).error).toBe('StaleTableInsertSelection');
    expect(f.messages.filter((m) => m.kind === 'insert-table')).toEqual([]);
  } finally {
    bridge.dispose();
    await f.editor.dispose();
  }
});

test('bridge reuses the exact SDK validated frozen defaults', async () => {
  const f = await setup('hwpx');
  const defaults = Object.freeze({ paragraph: 0, character: 0, style: 0, border_fill: 0 });
  let queries = 0;
  const bridge = createTableInsertBridge(f.editor, {
    ...core,
    getTableInsertAvailability(state, target) {
      queries++;
      const result = core.getTableInsertAvailability(state, target);
      expect(result.allowed).toBe(true);
      return { allowed: true, reason: null, resources: defaults };
    },
  });
  try {
    expect(bridge.capture().resources).toBe(defaults);
    expect(queries).toBe(1);
  } finally {
    bridge.dispose();
    await f.editor.dispose();
  }
});
