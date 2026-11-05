import { expect, test } from 'bun:test';
import { createEditor, SPLICE_TEXT_COMMAND } from '@hwpjs/core';
import { createSymbolInsertionPort } from '../src/symbol-insertion-port.ts';

function setup() {
  const target = { owner: 'owner', startUnit: 0, endUnit: 0 };
  let state: any = { status: 'ready', selection: target, content: {}, capabilities: {} };
  let beforeCollector: (() => void) | undefined;
  let updates = 0,
    dispatches = 0;
  const editor: any = {
    getEditorState: () => state,
    registerStateListener: () => () => {},
    update: async (callback: any) => {
      updates++;
      beforeCollector?.();
      callback({
        dispatchCommand: () => {
          dispatches++;
        },
      });
      return { results: [{ status: 'rejected', error: 'TestBoundary' }] };
    },
  };
  return {
    port: createSymbolInsertionPort(editor),
    replace: () => {
      state = { ...state };
    },
    readonly: () => {
      state = { ...state, capabilities: { readOnly: true } };
    },
    beforeCollector: (callback: () => void) => {
      beforeCollector = callback;
    },
    counts: () => ({ updates, dispatches }),
  };
}
test('권한 readonly는 내용 필드가 없어도 삽입을 거부한다', async () => {
  const f = setup();
  f.readonly();
  const captured = f.port.capture();
  expect(captured.reason).toBe('읽기 전용 문서입니다.');
  await expect(f.port.insert(captured, '※')).rejects.toThrow('ReadOnlyDocument');
  expect(f.counts()).toEqual({ updates: 0, dispatches: 0 });
});
test('열린 뒤 상태 교체는 같은 target이어도 큐 진입 전에 거부한다', async () => {
  const f = setup();
  const captured = f.port.capture();
  f.replace();
  await expect(f.port.insert(captured, '※')).rejects.toThrow('StaleSymbolSelection');
  expect(f.counts()).toEqual({ updates: 0, dispatches: 0 });
});
test('collector 직전 재진입으로 상태가 교체되면 명령을 발급하지 않는다', async () => {
  const f = setup();
  const captured = f.port.capture();
  f.beforeCollector(f.replace);
  await expect(f.port.insert(captured, '※')).rejects.toThrow('StaleSymbolSelection');
  expect(f.counts()).toEqual({ updates: 1, dispatches: 0 });
});
test('직접 포트 호출도 잘못된 UTF16과 64 단위 초과를 거부한다', async () => {
  const f = setup();
  for (const text of ['', '\ud800', '\n', '😀'.repeat(33)])
    await expect(f.port.insert(f.port.capture(), text)).rejects.toThrow();
  expect(f.counts()).toEqual({ updates: 0, dispatches: 0 });
});
test('32개 astral 문자는 기존 64 UTF16 경계 안에서 한 명령만 발급한다', async () => {
  const f = setup();
  await f.port.insert(f.port.capture(), '😀'.repeat(32));
  expect(f.counts()).toEqual({ updates: 1, dispatches: 1 });
});

// 실제 공개 Core와 controlled runtime의 계약 시험이며 Native/Canvas 검증은 아니다.
test('실제 공통 Core의 동기 collector 삽입과 큐 뒤 stale 거부', async () => {
  let text = 'AB',
    revision = 0,
    splices = 0;
  const editor = createEditor({
    runtimeFactory: () => ({
      async request(m: any) {
        if (m.kind === 'splice') {
          text = text.slice(0, m.startUnit) + m.text + text.slice(m.endUnit);
          revision++;
          splices++;
        }
        return {
          kind: m.kind,
          content: {
            format: 'hwpx',
            paragraphs: [
              { section: 0, paragraph: 0, text, editable: true, selectionOwner: 'section:0:body' },
            ],
          },
          historyRevision: revision,
          meta: { application: 'applied', changed: true },
        };
      },
      dispose() {},
    }),
  });
  try {
    await editor.load(new Uint8Array([1]), { format: 'hwpx' });
    const select = async () =>
      editor.setSelection({
        ...editor.getEditorState().token,
        coordinateSpace: 'display',
        format: 'hwpx',
        owner: 'section:0:body',
        section: 0,
        paragraph: 0,
        startUnit: 1,
        endUnit: 1,
        affinity: 'forward',
      });
    await select();
    const port = createSymbolInsertionPort(editor),
      captured = port.capture();
    const result = await port.insert(captured, '😀');
    expect(result.status).toBe('committed-with-snapshot');
    expect(result.caretRestored).toBe(true);
    expect(text).toBe('A😀B');
    expect(splices).toBe(1);
    await select();
    const pendingCapture = port.capture();
    const first = editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
      target: pendingCapture.target!,
      text: 'X',
      selectionVersion: pendingCapture.state.stateVersion,
    });
    const second = port.insert(pendingCapture, 'Y');
    expect((await first).status).toBe('committed-with-snapshot');
    const late = await second;
    expect(late.status).not.toBe('committed-with-snapshot');
    expect(splices).toBe(2);
    expect(text).toBe('AX😀B');
  } finally {
    await editor.dispose();
  }
});
