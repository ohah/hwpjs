import { test, expect } from 'bun:test';
import { getDocumentTextStatistics } from '@hwpjs/core';
import { createDocumentStatisticsController } from '../src/document-statistics-controller.ts';
import { createDocumentStatisticsView } from '../src/document-statistics-view.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
function setup(options: any = {}) {
  let state: any = {
    status: 'ready',
    documentId: 'first',
    generation: 1,
    content: {
      format: 'hwpx',
      paragraphs: [
        { section: 0, paragraph: 0, text: '한글 A\u0301 😀\ufffc\n다음', editable: true },
      ],
      ...options.content,
    },
    ...options.state,
  };
  const listeners = new Set<(state: any) => void>();
  const dom = documentFixture();
  let focused = 0;
  const errors: string[] = [];
  const editor: any = {
    getEditorState: () => state,
    registerStateListener(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const controller = createDocumentStatisticsController({
    editor,
    createView: (dismiss) => createDocumentStatisticsView(dom.root as any, dismiss),
    onClose: () => {
      focused++;
    },
    onStatus: (m) => errors.push(m),
  });
  const update = (next: any) => {
    state = next;
    for (const fn of listeners) fn(state);
  };
  return {
    controller,
    dom,
    editor,
    errors,
    listeners,
    get focused() {
      return focused;
    },
    get state() {
      return state;
    },
    update,
  };
}
test('다국어 값은 공개 통계 API와 동일하고 읽기만 한다', () => {
  const s = setup();
  const before = s.state;
  const expected = getDocumentTextStatistics(before);
  expect(s.controller.open()).toBe(true);
  for (const key of ['characters', 'charactersWithoutWhitespace', 'words', 'paragraphs'] as const)
    expect(s.dom.role('statistics-' + key).textContent).toBe(String(expected[key]));
  expect(s.state).toBe(before);
  expect(s.dom.role('statistics-scope').dataset.complete).toBe('true');
  s.controller.dispose();
});
test('읽기 전용도 조회 가능하고 문서 없음은 거부', () => {
  const s = setup({ content: { readOnly: true } });
  expect(s.controller.open()).toBe(true);
  s.controller.dispose();
  const empty = setup({ state: { status: 'empty' } });
  expect(empty.controller.open()).toBe(false);
  expect(empty.dom.root.children.length).toBe(0);
  expect(empty.errors.length).toBe(1);
  empty.controller.dispose();
});
test('window/limited/clipped는 전체 문서라고 표시하지 않는다', () => {
  for (const content of [
    { window: { start: 0 } },
    { limited: true },
    { paragraphs: [{ section: 0, paragraph: 0, text: '부분', clipped: true }] },
  ]) {
    const s = setup({ content });
    s.controller.open();
    expect(s.dom.role('statistics-scope').dataset.complete).toBe('false');
    expect(s.dom.role('statistics-scope').textContent).toContain('현재 불러온 범위');
    s.controller.dispose();
  }
});
test('선택 변경은 열린 창과 최신 선택을 유지한다', () => {
  const s = setup();
  s.controller.open();
  const dialog = s.dom.role('document-statistics');
  const selection = { startUnit: 1, endUnit: 2 };
  s.update({ ...s.state, selection });
  expect(s.controller.isOpen).toBe(true);
  expect(s.dom.role('document-statistics')).toBe(dialog);
  s.controller.close(true);
  expect(s.state.selection).toBe(selection);
  expect(s.focused).toBe(1);
  s.controller.dispose();
});
test('동일 문서 텍스트 갱신을 공개 API로 다시 조회한다', () => {
  const s = setup();
  s.controller.open();
  s.update({
    ...s.state,
    content: { ...s.state.content, paragraphs: [{ section: 0, paragraph: 0, text: 'ABC' }] },
  });
  expect(s.dom.role('statistics-characters').textContent).toBe('3');
  s.controller.dispose();
});
test('문서 교체/세대/로딩/실패는 폐기하고 이전 Canvas 포커스를 복구하지 않는다', () => {
  for (const patch of [
    { documentId: 'second' },
    { generation: 2 },
    { status: 'loading' },
    { status: 'error' },
  ]) {
    const s = setup();
    s.controller.open();
    s.update({ ...s.state, ...patch });
    expect(s.controller.isOpen).toBe(false);
    expect(s.focused).toBe(0);
    expect(s.dom.root.children.length).toBe(0);
    s.controller.dispose();
  }
});
test('Escape·닫기와 IME 조합/229 경계를 보존한다', () => {
  const s = setup();
  s.controller.open();
  const dialog = s.dom.role('document-statistics');
  fire(dialog, 'compositionstart');
  fire(dialog, 'keydown', { key: 'Escape', isComposing: false, keyCode: 0 });
  expect(s.controller.isOpen).toBe(true);
  fire(dialog, 'cancel');
  expect(s.controller.isOpen).toBe(true);
  fire(dialog, 'compositionend');
  fire(dialog, 'keydown', { key: 'Escape', keyCode: 229 });
  expect(s.controller.isOpen).toBe(true);
  fire(dialog, 'keydown', { key: 'Escape', keyCode: 27 });
  expect(s.controller.isOpen).toBe(false);
  expect(s.focused).toBe(1);
  s.controller.open();
  fire(s.dom.role('close-text-tool'), 'click');
  expect(s.focused).toBe(2);
  s.controller.dispose();
});
test('Tab/ShiftTab은 공통 모달 레이어에서 순환한다', () => {
  const s = setup();
  s.controller.open();
  const dialog = s.dom.role('document-statistics'),
    close = s.dom.role('close-text-tool'),
    dismiss = s.dom.role('dialog-dismiss');
  expect(s.dom.doc.activeElement).toBe(close);
  fire(dialog, 'keydown', { key: 'Tab', shiftKey: false });
  expect(s.dom.doc.activeElement).toBe(dismiss);
  fire(dialog, 'keydown', { key: 'Tab', shiftKey: true });
  expect(s.dom.doc.activeElement).toBe(close);
  s.controller.dispose();
});
test('관측 오류는 숫자 0으로 위장하지 않고 닫기를 허용한다', () => {
  const s = setup({ content: { paragraphs: [{ section: 0, paragraph: 0, text: null }] } });
  expect(s.controller.open()).toBe(true);
  expect(s.dom.role('statistics-scope').dataset.complete).toBe('unknown');
  expect(s.dom.role('statistics-characters').textContent).toBe('—');
  expect(s.errors.length).toBe(1);
  s.controller.close(true);
  expect(s.focused).toBe(1);
  s.controller.dispose();
});
test('재열기/dispose 중복은 구독과 포커스 부작용을 남기지 않는다', () => {
  const s = setup();
  s.controller.open();
  s.controller.open();
  expect(s.dom.root.children.length).toBe(1);
  s.controller.dispose();
  s.controller.dispose();
  expect(s.listeners.size).toBe(0);
  expect(s.controller.open()).toBe(false);
  expect(s.focused).toBe(0);
});

import { createTextToolsBridge } from '../src/text-tools-bridge.ts';
test('공유 word-count 명령은 새 창에 한 번 연결되고 선택 이벤트로 닫히지 않는다', async () => {
  const s = setup();
  s.controller.dispose();
  let returned = 0;
  const bridge = createTextToolsBridge({
    editor: s.editor,
    root: s.dom.root as any,
    onStatus: () => {},
    onClose: () => {
      returned++;
    },
  });
  expect(bridge.presentation()['word-count']?.enabled).toBe(true);
  expect(await bridge.action({ command: 'word-count' } as any)).toBe(true);
  const dialog = s.dom.role('document-statistics');
  expect(dialog.open).toBe(true);
  expect(s.dom.role('statistics-characters').textContent).toBe(
    String(getDocumentTextStatistics(s.state).characters),
  );
  s.update({ ...s.state, selection: { startUnit: 0, endUnit: 1 } });
  expect(dialog.open).toBe(true);
  fire(s.dom.root, 'keydown', { key: 'F3', code: 'F3' });
  expect(s.dom.role('document-statistics')).toBe(dialog);
  fire(s.dom.role('close-text-tool'), 'click');
  expect(returned).toBe(1);
  bridge.dispose();
  expect(s.listeners.size).toBe(0);
});
test('로딩 중 공유 명령 거부와 열린 창의 문서 교체는 변경 요청이 없다', async () => {
  const s = setup();
  s.controller.dispose();
  let returned = 0;
  const bridge = createTextToolsBridge({
    editor: s.editor,
    root: s.dom.root as any,
    onStatus: () => {},
    onClose: () => {
      returned++;
    },
  });
  await bridge.action({ command: 'word-count' } as any);
  s.update({ ...s.state, status: 'loading' });
  expect(s.dom.root.children.length).toBe(0);
  expect(bridge.presentation()['word-count']?.enabled).toBe(false);
  await bridge.action({ command: 'word-count' } as any);
  expect(s.dom.root.children.length).toBe(0);
  expect(returned).toBe(0);
  bridge.dispose();
});

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createEditor } from '@hwpjs/core';
import { createReaderRuntimeFactory } from '@hwpjs/core/runtime';
const wasmPath = process.env.HWPJS_TEST_WASM;
const nativeEvidence: unknown[] = [];
for (const format of ['hwp5', 'hwpx'] as const) {
  test.skipIf(!wasmPath)(
    `실제 Native 읽기 전용 ${format} 통계는 변경 요청 없이 조회한다`,
    async () => {
      const wasm = await readFile(wasmPath!);
      const bytes = await readFile(
        resolve(
          process.env.HWPJS_TEST_FIXTURE_ROOT ?? process.cwd(),
          'apps/docs/docs/public/editor/fixtures/noori.' + (format === 'hwp5' ? 'hwp' : 'hwpx'),
        ),
      );
      const factory = createReaderRuntimeFactory({ wasmModule: await WebAssembly.compile(wasm) });
      const requests: string[] = [];
      const editor = createEditor({
        runtimeFactory: async () => {
          const runtime = await factory();
          return {
            request(message: any, context: any) {
              requests.push(message.kind);
              return runtime.request(message, context);
            },
            dispose() {
              return runtime.dispose();
            },
          };
        },
      });
      const dom = documentFixture();
      const controller = createDocumentStatisticsController({
        editor,
        createView: (dismiss) => createDocumentStatisticsView(dom.root as any, dismiss),
        onStatus: (message) => {
          throw Error(message);
        },
      });
      try {
        await editor.load(bytes, { format, editable: false });
        expect((editor.getEditorState().content as any).readOnly).toBe(true);
        const count = requests.length;
        const before = editor.getEditorState();
        expect(controller.open()).toBe(true);
        const statistics = getDocumentTextStatistics(before);
        expect(dom.role('statistics-characters').textContent).toBe(String(statistics.characters));
        controller.close(true);
        expect(editor.getEditorState()).toBe(before);
        expect(requests.length).toBe(count);
        nativeEvidence.push({
          format,
          readOnly: true,
          statistics,
          queryRequests: requests.length - count,
          readonlySaveTested: false,
          wasmSHA: createHash('sha256').update(wasm).digest('hex'),
        });
        if (process.env.HWPJS_STATS_EVIDENCE)
          await writeFile(
            process.env.HWPJS_STATS_EVIDENCE,
            JSON.stringify(nativeEvidence, null, 2),
          );
      } finally {
        controller.dispose();
        await editor.dispose();
      }
    },
  );
}
