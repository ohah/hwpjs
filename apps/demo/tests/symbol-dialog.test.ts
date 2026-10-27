import { test, expect } from 'bun:test';
import { createSymbolInsertionPort } from '../src/symbol-insertion-port.ts';
import { symbolTextError, SYMBOL_CATEGORIES } from '../src/symbol-catalog.ts';
import { createSymbolDialogController } from '../src/symbol-dialog-controller.ts';
import { documentFixture, fire, all } from './formatting-dialog-test-dom.ts';

function fixture() {
  const dom = documentFixture();
  let state: any = {
    status: 'ready',
    editorId: 'e',
    documentId: 'a',
    generation: 1,
    stateVersion: 7,
  };
  let listener: (value: any) => void = () => {},
    calls = 0,
    focus = 0,
    reason: string | null = null;
  let execute: (text: string) => Promise<any> = async () => ({ status: 'committed-with-snapshot' });
  const statuses: string[] = [];
  const target = { owner: 'owner', startUnit: 0, endUnit: 0 };
  const controller = createSymbolDialogController({
    root: dom.root as any,
    port: {
      capture: () => ({ state, target: target as any, reason }),
      insert: async (_capture, text) => {
        calls++;
        return execute(text);
      },
      subscribe: (fn) => {
        listener = fn;
        return () => {
          listener = () => {};
        };
      },
    },
    onClose: () => {
      focus++;
    },
    onStatus: (text) => {
      statuses.push(text);
    },
  });
  return {
    ...dom,
    controller,
    statuses,
    get calls() {
      return calls;
    },
    get focus() {
      return focus;
    },
    updateSilently(delta: any) {
      state = { ...state, ...delta };
    },
    update(delta: any) {
      state = { ...state, ...delta };
      listener(state);
    },
    refuse(value: string) {
      reason = value;
    },
    execute(fn: typeof execute) {
      execute = fn;
    },
    submit(text: string) {
      const input = dom.role('symbol-text');
      input.value = text;
      fire(input, 'input');
      fire(dom.role('symbol-insert'), 'click');
    },
  };
}
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
test('모든 범주와 조합·astral 문자열은 유효하다', () => {
  expect(SYMBOL_CATEGORIES.length).toBe(5);
  for (const category of SYMBOL_CATEGORIES)
    for (const text of category.values) expect(symbolTextError(text)).toBeNull();
  for (const text of ['e\u0301', '😀', '👩‍💻', '🇰🇷']) expect(symbolTextError(text)).toBeNull();
});
test('빈 문자열·제어·짝 없는 서로게이트·과대 문자열은 거부한다', () => {
  for (const text of ['', '\r\n', '\0', '\ud800', '\udc00', 'a'.repeat(65)])
    expect(symbolTextError(text)).not.toBeNull();
});
test('기호 클릭은 선택만 하고 넣기는 단일 명령이다', async () => {
  const f = fixture();
  f.controller.open();
  const button = all(f.root).find((n) => n.textContent === '★')!;
  fire(button, 'click');
  expect(f.calls).toBe(0);
  fire(f.role('symbol-insert'), 'click');
  await settle();
  expect(f.calls).toBe(1);
  expect(f.focus).toBe(1);
  expect(f.role('symbol-dialog')).toBeUndefined();
  f.controller.dispose();
});
test('동시에 두 번 넣어도 대기 중 명령을 중복 접수하지 않는다', async () => {
  const f = fixture();
  let resolve!: (v: any) => void;
  f.execute(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  f.controller.open();
  f.submit('😀');
  f.submit('★');
  expect(f.calls).toBe(1);
  resolve({ status: 'committed-with-snapshot' });
  await settle();
  expect(f.focus).toBe(1);
  f.controller.dispose();
});
test('readonly와 보호 선택 사전 거부를 유지한다', () => {
  for (const reason of ['ReadOnlyDocument', 'ProtectedSelection']) {
    const f = fixture();
    f.refuse(reason);
    f.controller.open();
    f.submit('★');
    expect(f.calls).toBe(0);
    expect(f.role('symbol-insert').disabled).toBe(true);
    f.controller.dispose();
  }
});
test('선택 버전 변경 후 이전 대상을 다시 발급하지 않는다', () => {
  const f = fixture();
  f.controller.open();
  f.update({ stateVersion: 8 });
  f.submit('★');
  expect(f.calls).toBe(0);
  expect(f.text()).toContain('선택이 바뀌었습니다');
  f.controller.dispose();
});
test('Native 보호·stale 거부는 성공으로 바꾸지 않는다', async () => {
  for (const error of ['ProtectedSelection', 'StaleClipboardSelection']) {
    const f = fixture();
    f.execute(async () => ({ status: 'rejected-unapplied', error }));
    f.controller.open();
    f.submit('★');
    await settle();
    expect(f.text()).toContain(error);
    expect(f.focus).toBe(0);
    f.controller.dispose();
  }
});
test('문서 교체 뒤 늦은 성공은 포커스나 새 창에 관여하지 않는다', async () => {
  const f = fixture();
  let resolve!: (v: any) => void;
  f.execute(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  f.controller.open();
  f.submit('★');
  f.update({ documentId: 'b' });
  resolve({ status: 'committed-with-snapshot' });
  await settle();
  expect(f.focus).toBe(0);
  expect(f.role('symbol-dialog')).toBeUndefined();
  f.controller.dispose();
});
test('dispose 뒤 늦은 오류는 창이나 포커스를 되살리지 않는다', async () => {
  const f = fixture();
  let reject!: (v: any) => void;
  f.execute(
    () =>
      new Promise((_r, j) => {
        reject = j;
      }),
  );
  f.controller.open();
  f.submit('★');
  f.controller.dispose();
  reject(Error('late'));
  await settle();
  expect(f.focus).toBe(0);
  expect(f.role('symbol-dialog')).toBeUndefined();
});
test('IME 조합 중 클릭은 삽입하지 않고 종료 후 삽입한다', async () => {
  const f = fixture();
  f.controller.open();
  fire(f.role('symbol-dialog'), 'compositionstart');
  f.submit('e\u0301');
  expect(f.calls).toBe(0);
  fire(f.role('symbol-dialog'), 'compositionend');
  f.submit('e\u0301');
  await settle();
  expect(f.calls).toBe(1);
  f.controller.dispose();
});
test('화면 갱신 불확실 상태는 성공 포커스 복귀로 바꾸지 않는다', async () => {
  const f = fixture();
  f.execute(async () => ({ status: 'committed-refresh-required' }));
  f.controller.open();
  f.submit('★');
  await settle();
  expect(f.calls).toBe(1);
  expect(f.focus).toBe(0);
  expect(f.role('symbol-dialog')).toBeUndefined();
  f.controller.dispose();
});
test('취소는 편집 명령 없이 포커스를 반환한다', () => {
  const f = fixture();
  f.controller.open();
  fire(f.role('symbol-cancel'), 'click');
  expect(f.calls).toBe(0);
  expect(f.focus).toBe(1);
  f.controller.dispose();
});

test('열지 않은 창을 반복 닫아도 포커스를 이동하지 않는다', () => {
  const f = fixture();
  f.controller.close();
  f.controller.close();
  expect(f.focus).toBe(0);
  f.controller.dispose();
});
test('열린 창을 중복 닫아도 포커스는 한 번만 복귀한다', () => {
  const f = fixture();
  f.controller.open();
  f.controller.close();
  f.controller.close();
  expect(f.focus).toBe(1);
  f.controller.dispose();
});
test('문서 교체 통지 후 close는 새 문서에 포커스를 주지 않는다', () => {
  const f = fixture();
  f.controller.open();
  f.update({ documentId: 'b' });
  f.controller.close();
  expect(f.focus).toBe(0);
  f.controller.dispose();
});
test('문서 교체 통지가 늦어도 닫기 전 현재 문서로 거부한다', () => {
  const f = fixture();
  f.controller.open();
  f.updateSilently({ documentId: 'b' });
  f.controller.close();
  expect(f.focus).toBe(0);
  f.controller.dispose();
});
test('destroy 중 문서 교체는 닫기 후 재확인으로 거부한다', () => {
  const f = fixture();
  f.controller.open();
  const dialog = f.role('symbol-dialog');
  const close = dialog.close.bind(dialog);
  dialog.close = () => {
    f.updateSilently({ documentId: 'b' });
    close();
  };
  f.controller.close();
  expect(f.focus).toBe(0);
  f.controller.dispose();
});
test('destroy 중 재진입 close는 중복 포커스를 만들지 않는다', () => {
  const f = fixture();
  f.controller.open();
  const dialog = f.role('symbol-dialog');
  const close = dialog.close.bind(dialog);
  dialog.close = () => {
    f.controller.close();
    close();
  };
  f.controller.close();
  expect(f.focus).toBe(0);
  f.controller.dispose();
});
test('정상 Escape는 같은 문서 포커스를 한 번 복귀한다', () => {
  const f = fixture();
  f.controller.open();
  fire(f.role('symbol-dialog'), 'keydown', { key: 'Escape' });
  f.controller.close();
  expect(f.focus).toBe(1);
  f.controller.dispose();
});
test('성공 삽입 후 반복 close도 정상 포커스를 늘리지 않는다', async () => {
  const f = fixture();
  f.controller.open();
  f.submit('😀');
  await settle();
  f.controller.close();
  f.controller.close();
  expect(f.calls).toBe(1);
  expect(f.focus).toBe(1);
  f.controller.dispose();
});

test('삽입 성공 뒤 caret 실패는 재시도 창이나 이전 위치 포커스를 남기지 않는다', async () => {
  const f = fixture();
  f.execute(async () => ({
    status: 'committed-with-snapshot',
    caretRestored: false,
    caretError: 'StaleSelectionObservation',
  }));
  f.controller.open();
  f.submit('★');
  await settle();
  expect(f.calls).toBe(1);
  expect(f.focus).toBe(0);
  expect(f.role('symbol-dialog')).toBeUndefined();
  f.controller.close();
  expect(f.focus).toBe(0);
  f.controller.dispose();
});

test('Native commit 뒤 caret 복원 거부는 원 삽입 성공을 잃지 않는다', async () => {
  const owner = 'section:0:body';
  const target = { format: 'hwpx', owner, section: 0, paragraph: 0, startUnit: 0, endUnit: 0 };
  const before: any = {
    editorId: 'e',
    documentId: 'a',
    generation: 1,
    status: 'ready',
    stateVersion: 1,
    operationRevision: 0,
    viewRevision: 0,
    selection: target,
    content: {
      format: 'hwpx',
      paragraphs: [{ section: 0, paragraph: 0, selectionOwner: owner, text: 'AB' }],
    },
  };
  const after: any = {
    ...before,
    stateVersion: 2,
    operationRevision: 1,
    viewRevision: 1,
    selection: null,
    token: { editorId: 'e', documentId: 'a', generation: 1, operationRevision: 1, viewRevision: 1 },
    content: {
      format: 'hwpx',
      paragraphs: [{ section: 0, paragraph: 0, selectionOwner: owner, text: '★AB' }],
    },
  };
  let current = before,
    mutations = 0,
    carets = 0;
  const original = { status: 'committed-with-snapshot', state: after, changed: true };
  const editor: any = {
    getEditorState: () => current,
    registerStateListener: () => () => {},
    async update(callback: any) {
      callback({
        dispatchCommand() {
          mutations++;
        },
      });
      current = after;
      return { results: [original] };
    },
    async setSelection() {
      carets++;
      throw Error('StaleSelectionObservation');
    },
  };
  const port = createSymbolInsertionPort(editor);
  const captured = port.capture();
  const result = await port.insert(captured, '★');
  expect(result.status).toBe('committed-with-snapshot');
  expect(result.error).toBeUndefined();
  expect(result.caretRestored).toBe(false);
  expect(result.caretError).toBe('StaleSelectionObservation');
  expect(mutations).toBe(1);
  expect(carets).toBe(1);
});

test('commit 뒤 snapshot 오류도 삽입 거부나 재시도 창으로 바꾸지 않는다', async () => {
  const f = fixture();
  f.execute(async () => ({ status: 'committed-refresh-required', error: 'SnapshotUnavailable' }));
  f.controller.open();
  f.submit('★');
  await settle();
  expect(f.calls).toBe(1);
  expect(f.focus).toBe(0);
  expect(f.role('symbol-dialog')).toBeUndefined();
  f.controller.dispose();
});

function committedEditor(change: 'selection' | 'document' | 'during-caret') {
  const target: any = {
    format: 'hwpx',
    owner: 'section:0:body',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 0,
  };
  const before: any = {
    editorId: 'e',
    documentId: 'a',
    generation: 1,
    status: 'ready',
    stateVersion: 1,
    operationRevision: 0,
    viewRevision: 0,
    selection: target,
    content: {
      format: 'hwpx',
      paragraphs: [{ section: 0, paragraph: 0, selectionOwner: target.owner, text: 'AB' }],
    },
  };
  const after: any = {
    ...before,
    stateVersion: 2,
    operationRevision: 1,
    viewRevision: 1,
    selection: null,
    token: { editorId: 'e', documentId: 'a', generation: 1, operationRevision: 1, viewRevision: 1 },
    content: {
      format: 'hwpx',
      paragraphs: [{ section: 0, paragraph: 0, selectionOwner: target.owner, text: '★AB' }],
    },
  };
  const newer = {
    ...after,
    stateVersion: 3,
    documentId: change === 'document' ? 'b' : 'a',
    selection: { ...target, startUnit: 2, endUnit: 2 },
  };
  const original = { status: 'committed-with-snapshot', changed: true, state: after };
  let current = before,
    edits = 0,
    carets = 0;
  const editor: any = {
    getEditorState: () => current,
    registerStateListener: () => () => {},
    async update(callback: any) {
      callback({
        dispatchCommand() {
          edits++;
        },
      });
      current = change === 'during-caret' ? after : newer;
      return { results: [original] };
    },
    async setSelection() {
      carets++;
      current = newer;
      throw Error('StaleSelectionObservation');
    },
  };
  return {
    editor,
    newer,
    original,
    get current() {
      return current;
    },
    get edits() {
      return edits;
    },
    get carets() {
      return carets;
    },
  };
}
for (const change of ['selection', 'document', 'during-caret'] as const) {
  test('commit 뒤 새 선택·문서 보존: ' + change, async () => {
    const f = committedEditor(change),
      port = createSymbolInsertionPort(f.editor),
      capture = port.capture();
    const result = await port.insert(capture, '★');
    expect(result.status).toBe(f.original.status);
    expect(result.error).toBeUndefined();
    expect((result as any).state).toBe(f.original.state);
    expect(result.caretRestored).toBe(false);
    expect(f.current).toBe(f.newer);
    expect(f.edits).toBe(1);
    expect(f.carets).toBe(change === 'during-caret' ? 1 : 0);
  });
}
test('문서 교체 뒤 늦은 caret 결과는 상태 알림과 포커스를 남기지 않는다', async () => {
  const f = fixture();
  let resolve!: (value: any) => void;
  f.execute(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  f.controller.open();
  f.submit('★');
  f.update({ documentId: 'b' });
  resolve({
    status: 'committed-with-snapshot',
    caretRestored: false,
    caretError: 'StaleSelectionObservation',
  });
  await settle();
  expect(f.statuses).toEqual([]);
  expect(f.focus).toBe(0);
  expect(f.calls).toBe(1);
  f.controller.dispose();
});
