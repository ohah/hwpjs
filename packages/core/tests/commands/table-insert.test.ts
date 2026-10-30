import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditor,
  createParagraphSelection,
  INSERT_TABLE_COMMAND,
  createCommand,
} from '../../src/index.ts';
import type { EditorRuntime, RuntimeMessage } from '../../src/contracts.ts';
import { tableInsertMessage } from '../../src/commands/table-insert.ts';
import { validateTableInsertOptions } from '../../src/commands/table-insert-options.ts';
const allowed = { paragraph: [0, 3], character: [0, 4], style: [0, 1], border_fill: [0, 2] };
const options = () => ({
  rows: 1,
  columns: 1,
  width: 15000,
  rowHeight: 5400,
  resources: { paragraph: 0, character: 0, style: 0, border_fill: 0 },
});
async function setup(
  config: {
    format?: 'hwp5' | 'hwpx';
    row?: Record<string, unknown>;
    content?: Record<string, unknown>;
    editable?: boolean;
    projectionError?: boolean;
  } = {},
) {
  const calls: RuntimeMessage[] = [];
  let revision = 0;
  const content = {
    format: config.format ?? 'hwpx',
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'A😀B',
        editable: true,
        selectionOwner: 'section:0:body',
        ...(config.format === 'hwp5'
          ? { currentReference: { kind: 'original', section: 0, id: '42', epoch: '2', scope: '1' } }
          : {}),
        ...config.row,
      },
    ],
    tableCreationAvailable: true,
    tableCreationResources: allowed,
    ...config.content,
  };
  const runtime: EditorRuntime = {
    async request(message, context) {
      calls.push(message);
      if (message.kind === 'insert-table') {
        revision++;
        return {
          kind: message.kind,
          historyRevision: revision,
          ...(config.projectionError ? { error: 'ProjectionFailed' } : { content }),
          meta: { context, application: 'applied', changed: true },
        };
      }
      return {
        kind: message.kind,
        content,
        historyRevision: revision,
        meta: { context, application: 'unapplied', changed: false },
      };
    },
    dispose() {},
  };
  const editor = createEditor({ runtimeFactory: () => runtime });
  await editor.load(new Uint8Array([1]), {
    format: config.format ?? 'hwpx',
    editable: config.editable ?? true,
  });
  const target = (startUnit = 0, endUnit = startUnit) =>
    createParagraphSelection(editor.getEditorState(), {
      section: 0,
      paragraph: 0,
      startUnit,
      endUnit,
    });
  return { editor, calls, target };
}
test('검증된 원값은 단일 기존 insert-table wire이며 HWPX +1을 core가 중복하지 않음', async () => {
  const h = await setup();
  try {
    const r = await h.editor.dispatchCommand(INSERT_TABLE_COMMAND, {
      target: h.target(),
      options: options(),
    });
    assert.equal(r.status, 'committed-with-snapshot');
    const call = h.calls.find((c) => c.kind === 'insert-table')!;
    assert.equal(call.paragraph, 0);
    assert.equal(call.unit, 0);
    assert.equal(Object.hasOwn(call, 'reference'), false);
    assert.equal(h.calls.filter((c) => c.kind === 'insert-table').length, 1);
    assert.equal(
      h.calls.some((c) => String(c.kind).startsWith('query-')),
      false,
    );
  } finally {
    await h.editor.dispose();
  }
});
test('HWP5 sourceOffsets를 재사용하고 original.id를 paragraph로 치환하지 않음', async () => {
  const h = await setup({
    format: 'hwp5',
    row: {
      text: 'A￼B',
      sourceOffsets: [
        { at: 0, source: 0 },
        { at: 2, source: 9 },
      ],
    },
  });
  try {
    const m = tableInsertMessage(
      { target: h.target(2), options: options() },
      h.editor.getEditorState(),
    );
    assert.equal(m.paragraph, 0);
    assert.equal(m.unit, 9);
  } finally {
    await h.editor.dispose();
  }
});
test('caret이 아닌 범위는 Native 호출 전에 거부', async () => {
  const h = await setup();
  try {
    const r = await h.editor.dispatchCommand(INSERT_TABLE_COMMAND, {
      target: h.target(0, 1),
      options: options(),
    });
    assert.equal(r.error, 'TableInsertionRequiresCaret');
    assert.equal(h.calls.filter((c) => c.kind === 'insert-table').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('u32·0·셀수·전체높이 overflow와 열보다 좁은 폭 거부', () => {
  for (const delta of [
    { rows: 0 },
    { columns: 0 },
    { rowHeight: 0 },
    { width: 0 },
    { rows: -1 },
    { columns: 1.5 },
    { width: NaN },
    { width: Infinity },
    { width: 0x100000000 },
    { rows: 100001 },
    { rows: 2, rowHeight: 0xffffffff },
  ])
    assert.throws(() => validateTableInsertOptions({ ...options(), ...delta }, allowed));
});
test('자원은 현재 관측 ID만 허용하고 부재·중복 목록을 정상값으로 대체하지 않음', () => {
  assert.throws(
    () =>
      validateTableInsertOptions(
        { ...options(), resources: { ...options().resources, style: 999 } },
        allowed,
      ),
    /InvalidTableCreationResources/,
  );
  for (const observed of [
    undefined,
    null,
    {},
    { ...allowed, style: [0, 0] },
    { ...allowed, style: [] },
  ])
    assert.throws(
      () => validateTableInsertOptions(options(), observed),
      /InvalidTableCreationResources/,
    );
});
test('원값 옵션의 알 수 없는 key·accessor·symbol·잘못된 prototype 거부', () => {
  for (const value of [
    { ...options(), flags: 1 },
    Object.create(options()),
    { ...options(), [Symbol('x')]: 1 },
    Object.defineProperty({ ...options() }, 'rows', {
      get() {
        throw Error('접근금지');
      },
    }),
  ])
    assert.throws(() => validateTableInsertOptions(value, allowed), /InvalidTableCreationOptions/);
});
test('readonly는 기존쓰기정책 이유를 보존하고 Native를 호출하지 않음', async () => {
  const h = await setup({ editable: false });
  try {
    const before = h.editor.getEditorState();
    const r = await h.editor.dispatchCommand(INSERT_TABLE_COMMAND, {
      target: h.target(),
      options: options(),
    });
    assert.equal(r.error, 'ReadOnlyDocument');
    assert.equal(h.editor.getEditorState(), before);
    assert.equal(h.calls.filter((c) => c.kind === 'insert-table').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('문서·세대·operation·view token 변조와 임의owner는 기존오류 유지', async () => {
  const h = await setup();
  try {
    const t = h.target();
    for (const delta of [
      { documentId: '다른문서' },
      { generation: t.generation + 1 },
      { operationRevision: t.operationRevision + 1 },
      { viewRevision: t.viewRevision + 1 },
    ])
      assert.throws(
        () =>
          tableInsertMessage(
            { target: { ...t, ...delta }, options: options() },
            h.editor.getEditorState(),
          ),
        /StaleTarget/,
      );
    assert.throws(
      () =>
        tableInsertMessage(
          { target: { ...t, owner: '임의소유자' }, options: options() },
          h.editor.getEditorState(),
        ),
      /InvalidSelectionOwner/,
    );
  } finally {
    await h.editor.dispose();
  }
});
test('note·표셀·drawing 소유자를 본문 삽입으로 확장하지 않음', async () => {
  for (const row of [
    { selectionOwner: 'section:0:note:1' },
    { tableCell: { tableNode: 1, listNode: 2 } },
    { drawingText: { drawingNode: 1, listNode: 2 } },
  ]) {
    const h = await setup({ row });
    try {
      const r = await h.editor.dispatchCommand(INSERT_TABLE_COMMAND, {
        target: h.target(),
        options: options(),
      });
      assert.equal(r.error, 'UnsupportedTableInsertOwner');
    } finally {
      await h.editor.dispose();
    }
  }
});
test('capability의 누락·unknown·false를 true로 간주하지 않음', async () => {
  for (const v of [undefined, false, null, 'unknown']) {
    const h = await setup({ content: { tableCreationAvailable: v } });
    try {
      const r = await h.editor.dispatchCommand(INSERT_TABLE_COMMAND, {
        target: h.target(),
        options: options(),
      });
      assert.equal(r.error, 'TableCreationUnavailable');
    } finally {
      await h.editor.dispose();
    }
  }
});
test('HWP5 미지원 생성reference는 ordinal ABI에 전달하지 않음', async () => {
  const h = await setup({
    format: 'hwp5',
    row: { currentReference: { kind: 'generated', section: 0, id: '1' } },
  });
  try {
    const r = await h.editor.dispatchCommand(INSERT_TABLE_COMMAND, {
      target: h.target(),
      options: options(),
    });
    assert.equal(r.error, 'UnsupportedTableInsertReference');
  } finally {
    await h.editor.dispose();
  }
});
test('첫 await 전 옵션과 자원 소유복사 유지', async () => {
  const h = await setup();
  try {
    const o = options(),
      pending = h.editor.dispatchCommand(INSERT_TABLE_COMMAND, { target: h.target(), options: o });
    o.rows = 7;
    o.resources.style = 999;
    const r = await pending;
    assert.equal(r.status, 'committed-with-snapshot');
    const call = h.calls.find((c) => c.kind === 'insert-table')!;
    assert.equal((call.options as any).rows, 1);
    assert.equal((call.options as any).resources.style, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('Native 적용 후 projection 실패는 rejected-unapplied로 분류하지 않음', async () => {
  const h = await setup({ projectionError: true });
  try {
    const before = h.editor.getEditorState();
    const r = await h.editor.dispatchCommand(INSERT_TABLE_COMMAND, {
      target: h.target(),
      options: options(),
    });
    assert.equal(r.status, 'committed-refresh-required');
    assert.equal(r.error, 'ProjectionFailed');
    assert.equal(h.editor.getEditorState().operationRevision, before.operationRevision + 1);
    assert.equal(h.calls.filter((c) => c.kind === 'insert-table').length, 1);
  } finally {
    await h.editor.dispose();
  }
});
test('같은 문자열 이름의 외부 command symbol은 Native로 우회하지 않음', async () => {
  const h = await setup();
  try {
    const r = await h.editor.dispatchCommand(createCommand('insert-table'), {
      target: h.target(),
      options: options(),
    });
    assert.equal(r.error, 'UnsupportedCommand');
    assert.equal(h.calls.filter((c) => c.kind === 'insert-table').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('서로게이트 내부 caret은 canonical facade에서 거부', async () => {
  const h = await setup();
  try {
    assert.throws(() => h.target(2), /InvalidScalarBoundary/);
  } finally {
    await h.editor.dispose();
  }
});
test('dispose 후 신규 표명령은 기존 terminal 계약으로 거부', async () => {
  const h = await setup(),
    t = h.target();
  await h.editor.dispose();
  await assert.rejects(
    async () => h.editor.dispatchCommand(INSERT_TABLE_COMMAND, { target: t, options: options() }),
    /EditorDisposed/,
  );
  assert.equal(h.calls.filter((c) => c.kind === 'insert-table').length, 0);
});
