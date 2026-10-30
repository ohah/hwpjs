import * as core from '@hwpjs/core';
import { test, expect } from 'bun:test';
import { createTableInsertBridge, tableInsertDimensions } from '../src/table-insert-bridge.ts';
import { createTableInsertController } from '../src/table-insert-tool.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
const draft = { rows: '2', columns: '3', widthPoints: '360', rowHeightPoints: '18' };
async function setup(delta: Record<string, unknown> = {}, rowDelta: Record<string, unknown> = {}) {
  const calls: any[] = [];
  let revision = 0;
  let mode = 'normal';
  const content = {
    format: 'hwpx',
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'ABC',
        editable: true,
        selectionOwner: 'section:0:body',
        ...rowDelta,
      },
    ],
    tableCreationAvailable: true,
    tableCreationResources: { paragraph: [3], character: [4], style: [5], border_fill: [6] },
    ...delta,
  };
  const runtime: core.EditorRuntime = {
    async request(message: any, context: any) {
      calls.push(message);
      if (message.kind === 'insert-table') {
        if (mode === 'reject')
          return {
            kind: message.kind,
            error: 'NativeRefused',
            historyRevision: revision,
            meta: { context, application: 'unapplied', changed: false },
          };
        revision++;
        return {
          kind: message.kind,
          ...(mode === 'projection' ? { error: 'ProjectionFailed' } : { content }),
          historyRevision: revision,
          meta: { context, application: 'applied', changed: true },
        };
      }
      if (message.kind === 'undo') revision--;
      return {
        kind: message.kind,
        content,
        historyRevision: revision,
        meta: {
          context,
          application: message.kind === 'undo' ? 'applied' : 'unapplied',
          changed: message.kind === 'undo',
        },
      };
    },
    dispose() {},
  };
  const editor = core.createEditor({ runtimeFactory: () => ({ ...runtime }) });
  await editor.load(new Uint8Array([1]), { format: 'hwpx', editable: true });
  const target = (n = 0, end = n) =>
    core.createParagraphSelection(editor.getEditorState(), {
      section: 0,
      paragraph: 0,
      startUnit: n,
      endUnit: end,
    });
  await editor.setSelection(target());
  const bridge = createTableInsertBridge(editor, core);
  return {
    editor,
    bridge,
    calls,
    target,
    setMode(v: string) {
      mode = v;
    },
    count: () => calls.filter((c) => c.kind === 'insert-table').length,
    async dispose() {
      bridge.dispose();
      await editor.dispose();
    },
  };
}
test('실새SDK 공개명령과 공통정수pt변환을 사용한다', async () => {
  const f = await setup();
  try {
    const before = f.editor.getEditorState(),
      lease = f.bridge.capture();
    expect(lease.reason).toBeNull();
    const result = await f.bridge.insert(lease, draft);
    expect(result.status).toBe('committed-with-snapshot');
    expect(f.count()).toBe(1);
    expect(f.editor.getEditorState()).not.toBe(before);
    expect(f.calls.find((c) => c.kind === 'insert-table').options).toEqual({
      rows: 2,
      columns: 3,
      width: 36000,
      rowHeight: 1800,
      resources: { paragraph: 3, character: 4, style: 5, border_fill: 6 },
    });
    expect(f.calls.filter((c) => String(c.kind).startsWith('query')).length).toBe(0);
    await f.editor.undo();
    expect(f.calls.filter((c) => c.kind === 'undo').length).toBe(1);
  } finally {
    await f.dispose();
  }
});
test('선택없음은 명령접수0', async () => {
  const f = await setup();
  try {
    await f.editor.setSelection(null);
    expect(f.bridge.presentation().enabled).toBe(false);
    expect((await f.bridge.insert(f.bridge.capture(), draft)).error).toBe('MissingSelection');
    expect(f.count()).toBe(0);
  } finally {
    await f.dispose();
  }
});
test('note owner는 발급허용이어도 본문전용명령에 전달0', async () => {
  const f = await setup({}, { selectionOwner: 'section:0:note:1' });
  try {
    expect(f.bridge.capture().reason).toBe('UnsupportedTableInsertOwner');
    expect((await f.bridge.insert(f.bridge.capture(), draft)).status).toBe('rejected-unapplied');
    expect(f.count()).toBe(0);
  } finally {
    await f.dispose();
  }
});
test('readonly는 사전거부', async () => {
  const f = await setup({ readOnly: true });
  try {
    expect(f.bridge.capture().reason).toBe('ReadOnlyDocument');
    expect(f.count()).toBe(0);
  } finally {
    await f.dispose();
  }
});
test('범위선택은 caret으로변환하지않음', async () => {
  const f = await setup();
  try {
    await f.editor.setSelection(f.target(0, 1));
    expect(f.bridge.capture().reason).toBe('TableInsertionRequiresCaret');
  } finally {
    await f.dispose();
  }
});
for (const available of [undefined, false, 'unknown'])
  test('capability정확true필수:' + String(available), async () => {
    const f = await setup({ tableCreationAvailable: available });
    try {
      expect(f.bridge.capture().reason).toBe('TableCreationUnavailable');
    } finally {
      await f.dispose();
    }
  });
for (const resources of [
  {},
  { paragraph: [0], character: [0], style: [], border_fill: [0] },
  { paragraph: [0], character: [0], style: [1, 1], border_fill: [0] },
])
  test('resource부재/빈값/중복거부:' + JSON.stringify(resources), async () => {
    const f = await setup({ tableCreationResources: resources });
    try {
      expect(f.bridge.capture().reason).toBe('InvalidTableCreationResources');
      expect(f.count()).toBe(0);
    } finally {
      await f.dispose();
    }
  });
test('선택변경으로기존lease무효', async () => {
  const f = await setup();
  try {
    const lease = f.bridge.capture();
    await f.editor.setSelection(f.target(1));
    expect((await f.bridge.insert(lease, draft)).error).toBe('StaleTableInsertSelection');
    expect(f.count()).toBe(0);
  } finally {
    await f.dispose();
  }
});
test('아직대기열에있는선택변경도barrier후거부', async () => {
  const f = await setup();
  try {
    const lease = f.bridge.capture();
    const change = f.editor.setSelection(f.target(1));
    const result = await f.bridge.insert(lease, draft);
    await change;
    expect(result.error).toBe('StaleTableInsertSelection');
    expect(f.count()).toBe(0);
  } finally {
    await f.dispose();
  }
});
test('중복insert는하나만접수', async () => {
  const f = await setup();
  try {
    const lease = f.bridge.capture();
    const first = f.bridge.insert(lease, draft);
    const second = await f.bridge.insert(lease, draft);
    expect(second.error).toBe('TableInsertPending');
    expect((await first).status).toBe('committed-with-snapshot');
    expect(f.count()).toBe(1);
  } finally {
    await f.dispose();
  }
});
test('위조lease는브랜드발급없이거부', async () => {
  const f = await setup();
  try {
    expect((await f.bridge.insert({ ...f.bridge.capture() }, draft)).error).toBe(
      'InvalidTableInsertLease',
    );
    expect(f.count()).toBe(0);
  } finally {
    await f.dispose();
  }
});
test('Native거부는원관측과history유지', async () => {
  const f = await setup();
  try {
    f.setMode('reject');
    const before = f.editor.getEditorState();
    expect((await f.bridge.insert(f.bridge.capture(), draft)).error).toBe('NativeRefused');
    expect(f.editor.getEditorState()).toBe(before);
    expect(f.editor.getEditorState().nativeHistoryRevision).toBe(0);
  } finally {
    await f.dispose();
  }
});
test('commit후projection실패는unapplied로위장0', async () => {
  const f = await setup();
  try {
    f.setMode('projection');
    const result = await f.bridge.insert(f.bridge.capture(), draft);
    expect(result.status).toBe('committed-refresh-required');
    expect(result.error).toBe('ProjectionFailed');
    expect(f.count()).toBe(1);
  } finally {
    await f.dispose();
  }
});
test('UI정수/정확pt/상한검사', () => {
  for (const delta of [
    { rows: '0' },
    { columns: '1.5' },
    { rows: '100001' },
    { widthPoints: '1e3' },
    { rowHeightPoints: '0.001' },
    { rowHeightPoints: '-1' },
    { widthPoints: 'NaN' },
    { widthPoints: '' },
  ])
    expect(() => tableInsertDimensions({ ...draft, ...delta })).toThrow();
  expect(tableInsertDimensions({ ...draft, widthPoints: '360.01' }).width).toBe(36001);
});
async function ui() {
  const f = await setup(),
    dom = documentFixture(),
    statuses: string[] = [];
  let focus = 0;
  const tool = createTableInsertController({
    root: dom.root as any,
    bridge: f.bridge,
    onStatus: (s) => statuses.push(s),
    onClose: () => {
      focus++;
    },
  });
  return {
    ...f,
    ...dom,
    tool,
    statuses,
    get focus() {
      return focus;
    },
    async dispose() {
      tool.dispose();
      await f.dispose();
    },
  };
}
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
test('모달취소는명령0/관측이력불변/포커스복귀', async () => {
  const f = await ui();
  try {
    const before = f.editor.getEditorState();
    f.tool.open();
    expect(f.role('table-insert-dialog').modal).toBe(true);
    fire(f.role('table-cancel'), 'click');
    expect(f.count()).toBe(0);
    expect(f.editor.getEditorState()).toBe(before);
    expect(f.focus).toBe(1);
  } finally {
    await f.dispose();
  }
});
test('모달선택변경은비활성/이전대상재발급0', async () => {
  const f = await ui();
  try {
    f.tool.open();
    await f.editor.setSelection(f.target(1));
    expect(f.role('table-insert').disabled).toBe(true);
    fire(f.role('table-insert'), 'click');
    await settle();
    expect(f.count()).toBe(0);
  } finally {
    await f.dispose();
  }
});
test('모달submit중복은단1/성공후자동선택0', async () => {
  const f = await ui();
  try {
    f.tool.open();
    const b = f.role('table-insert');
    fire(b, 'click');
    fire(b, 'click');
    await settle();
    expect(f.count()).toBe(1);
    expect(f.role('table-insert-dialog')).toBeUndefined();
    expect(f.statuses.join()).toContain('자동 선택');
    expect(f.focus).toBe(0);
  } finally {
    await f.dispose();
  }
});
test('열린다른modal과상호배타', async () => {
  const f = await ui();
  try {
    const other = f.doc.createElement('dialog');
    f.root.append(other);
    other.showModal();
    f.tool.open();
    expect(f.role('table-insert-dialog')).toBeUndefined();
    expect(f.statuses.join()).toContain('먼저 닫아');
    expect(f.count()).toBe(0);
  } finally {
    await f.dispose();
  }
});
test('문서교체는기존모달을닫고새문서포커스오염0', async () => {
  const f = await ui();
  try {
    f.tool.open();
    await f.editor.load(new Uint8Array([2]), { format: 'hwpx', editable: true });
    expect(f.role('table-insert-dialog')).toBeUndefined();
    expect(f.focus).toBe(0);
  } finally {
    await f.dispose();
  }
});
test('모달Native거부는닫거나성공표시하지않음', async () => {
  const f = await ui();
  try {
    f.setMode('reject');
    const before = f.editor.getEditorState();
    f.tool.open();
    fire(f.role('table-insert'), 'click');
    await settle();
    expect(f.editor.getEditorState()).toBe(before);
    expect(f.role('table-status').textContent).toContain('NativeRefused');
    expect(f.role('table-insert-dialog')).toBeDefined();
    expect(f.statuses.length).toBe(0);
  } finally {
    await f.dispose();
  }
});
