import { test, expect } from 'bun:test';
import { createFontNameView } from '../src/font-name-view.ts';
import { createFontNameTool } from '../src/font-name-tool.ts';
import { documentFixture, fire, all } from './formatting-dialog-test-dom.ts';
// @ts-ignore 테스트도 기존 언어 순서를 재사용한다.
import { FONT_LANGUAGES } from '../../../js/font-face-identity.mjs';
function key(node: EventTarget, values: Record<string, unknown>) {
  const event = new Event('keydown', { cancelable: true });
  for (const [name, value] of Object.entries(values))
    Object.defineProperty(event, name, { value, configurable: true });
  node.dispatchEvent(event);
  return event;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve!: (value?: any) => void;
  const promise = new Promise<any>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function state(options: any = {}) {
  const target = {
    editorId: 'font',
    documentId: options.doc ?? 'doc',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
    coordinateSpace: 'display',
    format: 'hwpx',
    owner: 'opaque-test-target',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 2,
    affinity: 'forward',
  };
  const values = Object.fromEntries(
    FONT_LANGUAGES.map((language: string) => [
      language,
      { kind: 'single', name: '원본 ' + language },
    ]),
  );
  return {
    status: 'ready',
    ...target,
    selection: target,
    ...options,
    values: { ...values, ...options.values },
    reasons: Object.fromEntries(FONT_LANGUAGES.map((l: string) => [l, options.reason ?? null])),
    content: {
      fontFaces:
        options.faces ??
        FONT_LANGUAGES.map((language: string) => ({ language, id: 0, name: '원본 ' + language })),
    },
  };
}
function fixture(options: any = {}) {
  const dom = documentFixture(),
    listeners = new Set<() => void>(),
    calls: any[] = [],
    statuses: string[] = [],
    errors: unknown[] = [],
    results: any[] = [];
  let current = state(options),
    focus = 0;
  const command = { name: 'set-character-font-name', id: Symbol('테스트 포트') };
  const editor: any = {
    getEditorState: () => current,
    registerStateListener(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async update() {
      if (options.barrier) await options.barrier();
    },
    async dispatchCommand(c: any, p: any) {
      calls.push({ command: c, payload: p });
      return options.dispatch
        ? options.dispatch()
        : { status: 'committed-with-snapshot', state: current, changed: true };
    },
  };
  const api: any = {
    command,
    observe(s: any) {
      return { target: s.selection, fontNames: s.values, fontNameAvailableReasons: s.reasons };
    },
  };
  const tool = createFontNameTool({
    root: dom.root as any,
    editor,
    api,
    onClose() {
      focus++;
      options.onClose?.();
    },
    onStatus(message) {
      statuses.push(message);
      options.onStatus?.();
    },
    onResult(result) {
      results.push(result);
      options.onResult?.();
    },
    onPresentationChange: options.onPresentationChange,
    onUIError: (e) => errors.push(e),
    createView: options.createView,
  });
  return {
    ...dom,
    tool,
    editor,
    api,
    calls,
    statuses,
    errors,
    results,
    listeners,
    get state() {
      return current;
    },
    get focus() {
      return focus;
    },
    open: () => tool.open(),
    language(value: string) {
      dom.role('font-name-language').value = value;
      fire(dom.role('font-name-language'), 'change');
    },
    input(value: string) {
      dom.role('font-name-input').value = value;
      fire(dom.role('font-name-input'), 'input');
    },
    apply() {
      fire(dom.role('font-name-apply'), 'click');
    },
    cancel() {
      fire(dom.role('font-name-cancel'), 'click');
    },
    publish(next: any) {
      current = next;
      for (const listener of listeners) listener();
    },
  };
}
test('주입 포트가 필수이며 기존 SDK 명령을 대신 생성하지 않는다', () => {
  const f = fixture();
  expect(() =>
    createFontNameTool({
      root: f.root as any,
      editor: f.editor,
      api: undefined as any,
      onClose() {},
      onStatus() {},
    }),
  ).toThrow('FontNameApiRequired');
  expect(f.calls.length).toBe(0);
  f.tool.dispose();
});
test('초기 언어를 추정하지 않고 7언어 관측을 별도로 표시한다', () => {
  const f = fixture({
    values: {
      latin: { kind: 'mixed' },
      hanja: { kind: 'unknown' },
      japanese: { kind: 'single', name: null },
      other: { kind: 'single', name: '' },
    },
  });
  f.open();
  expect(f.role('font-name-language').value).toBe('');
  expect(f.role('font-name-apply').disabled).toBe(true);
  expect(all(f.root).filter((n) => n.dataset.role?.startsWith('font-name-current-')).length).toBe(
    7,
  );
  expect(f.role('font-name-current-latin').textContent).toBe('서로 다른 글꼴');
  expect(f.role('font-name-current-hanja').textContent).toBe('알 수 없음');
  expect(f.role('font-name-current-japanese').textContent).toContain('원본 이름');
  expect(f.role('font-name-current-other').textContent).toBe('빈 원본 이름');
  expect(f.calls.length).toBe(0);
  f.tool.dispose();
});
test('실제 이름 mixed를 혼합 관측으로 바꾸지 않는다', () => {
  const f = fixture({ values: { latin: { kind: 'single', name: 'mixed' } } });
  f.open();
  f.language('latin');
  expect(f.role('font-name-current-latin').textContent).toBe('"mixed"');
  expect(f.role('font-name-input').value).toBe('mixed');
  expect(f.role('font-name-apply').disabled).toBe(true);
  f.tool.dispose();
});
test('문서 이름은 언어 파티션 안에서 정확한 문자열 중복만 제거한다', () => {
  const f = fixture({
    faces: [
      { language: 'hangul', id: 0, name: 'A' },
      { language: 'hangul', id: 1, name: 'A' },
      { language: 'hangul', id: 2, name: ' A ' },
      { language: 'latin', id: 0, name: 'B' },
      { language: 'other', id: 0, name: null },
    ],
  });
  f.open();
  f.language('hangul');
  expect(f.role('font-name-document-names').children.map((n) => n.value)).toEqual(['', 'A', ' A ']);
  f.language('latin');
  expect(f.role('font-name-document-names').children.map((n) => n.value)).toEqual(['', 'B']);
  f.tool.dispose();
});
test('이름 공백과 결합 문자를 정규화하지 않고 단일 명령에 보낸다', async () => {
  const f = fixture();
  const target = f.state.selection;
  f.open();
  f.language('latin');
  f.input('  e\u0301  ');
  f.apply();
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.calls[0].command).toBe(f.api.command);
  expect(f.calls[0].payload).toEqual({ target, language: 'latin', name: '  e\u0301  ' });
  expect(f.calls[0].payload.target).toBe(target);
  expect(f.focus).toBe(1);
  f.tool.dispose();
});
test('명시 7언어가 각각 한 명령으로만 전달된다', async () => {
  for (const language of FONT_LANGUAGES) {
    const f = fixture();
    f.open();
    f.language(language);
    f.input('새 이름');
    f.apply();
    await tick();
    expect(f.calls.length).toBe(1);
    expect(f.calls[0].payload.language).toBe(language);
    f.tool.dispose();
  }
});
test('빈 이름·깨진 UTF16·UTF8 한도 초과는 명령0이다', async () => {
  for (const name of ['', '\ud800', '\udc00', '가'.repeat(1366)]) {
    const f = fixture();
    f.open();
    f.language('hangul');
    f.input(name);
    expect(f.role('font-name-apply').disabled).toBe(true);
    f.apply();
    await tick();
    expect(f.calls.length).toBe(0);
    f.tool.dispose();
  }
  const f = fixture();
  f.open();
  f.language('latin');
  f.input('a'.repeat(4096));
  expect(f.role('font-name-apply').disabled).toBe(false);
  f.tool.dispose();
});
test('dirty0·원래 이름으로 복귀·언어 미선택·취소는 명령0이다', async () => {
  const f = fixture();
  f.open();
  f.language('hangul');
  expect(f.role('font-name-apply').disabled).toBe(true);
  f.input('다른 이름');
  f.input('원본 hangul');
  expect(f.role('font-name-apply').disabled).toBe(true);
  f.language('');
  expect(f.role('font-name-language').value).toBe('');
  f.apply();
  f.cancel();
  await tick();
  expect(f.calls.length).toBe(0);
  expect(f.focus).toBe(1);
  f.tool.dispose();
});
test('readonly·caret·unknown binding은 조회하되 적용을 거부한다', async () => {
  for (const reason of [
    'ReadOnlyDocument',
    'EmptyCharacterSelection',
    'UnknownCharacterFontName',
  ]) {
    const f = fixture({ reason });
    f.open();
    f.language('latin');
    expect(f.role('font-name-input').disabled).toBe(true);
    expect(f.role('font-name-apply').disabled).toBe(true);
    f.input('새 이름');
    f.apply();
    await tick();
    expect(f.calls.length).toBe(0);
    f.tool.dispose();
  }
});
test('single null은 기본 이름을 만들지 않고 명시 교체만 가능하다', async () => {
  const f = fixture({ values: { latin: { kind: 'single', name: null } } });
  f.open();
  f.language('latin');
  expect(f.role('font-name-input').value).toBe('');
  expect(f.role('font-name-apply').disabled).toBe(true);
  f.input('명시 이름');
  f.apply();
  await tick();
  expect(f.calls[0].payload.name).toBe('명시 이름');
  f.tool.dispose();
});
test('선택이 바뀌면 stale로 거부하고 취소는 최신 선택을 보존한다', async () => {
  const f = fixture();
  f.open();
  f.language('latin');
  f.input('새 이름');
  const next = { ...f.state, selection: { ...f.state.selection, startUnit: 1 } };
  f.publish(next);
  expect(f.role('font-name-apply').disabled).toBe(true);
  f.apply();
  f.cancel();
  await tick();
  expect(f.calls.length).toBe(0);
  expect(f.state.selection).toBe(next.selection);
  expect(f.focus).toBe(1);
  f.tool.dispose();
});
test('대기열 장벽 뒤 상태가 바뀌면 이전 target을 제출하지 않는다', async () => {
  const gate = deferred();
  const f = fixture({ barrier: () => gate.promise });
  f.open();
  f.language('latin');
  f.input('새 이름');
  f.apply();
  f.publish({ ...f.state, stateVersion: 2 });
  gate.resolve();
  await tick();
  expect(f.calls.length).toBe(0);
  expect(f.role('font-name-status').textContent).toContain('바뀌었습니다');
  f.tool.dispose();
});
test('pending 중 중복 확인·취소·Enter를 막고 ACK는 한 번 보고한다', async () => {
  const gate = deferred();
  const f = fixture({ dispatch: () => gate.promise });
  f.open();
  f.language('latin');
  f.input('새 이름');
  f.apply();
  await tick();
  f.apply();
  f.cancel();
  key(f.role('font-name-dialog'), { key: 'Enter', target: f.role('font-name-input') });
  expect(f.calls.length).toBe(1);
  expect(f.role('font-name-cancel').disabled).toBe(true);
  gate.resolve({ status: 'committed-with-snapshot', state: f.state });
  await tick();
  expect(f.results.length).toBe(1);
  expect(f.focus).toBe(1);
  f.tool.dispose();
});
test('문서 교체 뒤 늦은 이전 ACK가 새 창의 pending을 지우지 않는다', async () => {
  const first = deferred(),
    second = deferred();
  let n = 0;
  const f = fixture({ dispatch: () => (++n === 1 ? first.promise : second.promise) });
  f.open();
  f.language('latin');
  f.input('옛 이름');
  f.apply();
  await tick();
  f.publish(state({ doc: 'new' }));
  f.open();
  f.language('hangul');
  f.input('새 이름');
  f.apply();
  await tick();
  first.resolve({ status: 'committed-with-snapshot' });
  await tick();
  expect(f.role('font-name-cancel').disabled).toBe(true);
  expect(f.results.length).toBe(0);
  expect(f.focus).toBe(0);
  second.resolve({ status: 'committed-with-snapshot' });
  await tick();
  expect(f.results.length).toBe(1);
  expect(f.focus).toBe(1);
  expect(f.calls.length).toBe(2);
  f.tool.dispose();
});
test('dispose 뒤 늦은 성공/실패는 UI·포커스·재요청이 없다', async () => {
  const gate = deferred();
  const f = fixture({ dispatch: () => gate.promise });
  f.open();
  f.language('latin');
  f.input('새 이름');
  f.apply();
  await tick();
  f.tool.dispose();
  gate.resolve({ status: 'committed-with-snapshot' });
  await tick();
  expect(f.listeners.size).toBe(0);
  expect(f.results.length).toBe(0);
  expect(f.focus).toBe(0);
  expect(f.calls.length).toBe(1);
});
test('UI 콜백 throw를 Native 미적용·재시도로 바꾸지 않는다', async () => {
  const f = fixture({
    onResult() {
      throw Error('UI result');
    },
    onStatus() {
      throw Error('UI status');
    },
    onClose() {
      throw Error('UI focus');
    },
  });
  f.open();
  f.language('latin');
  f.input('새 이름');
  f.apply();
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.results.length).toBe(1);
  expect(f.errors.length).toBe(3);
  f.tool.dispose();
});
test('성공 observer가 문서를 바꿔도 새 창을 닫지 않는다', async () => {
  let f: ReturnType<typeof fixture>;
  f = fixture({
    onResult() {
      f.publish(state({ doc: 'second' }));
      f.open();
    },
  });
  f.open();
  f.language('latin');
  f.input('새 이름');
  f.apply();
  await tick();
  expect(f.role('font-name-dialog').open).toBe(true);
  expect(f.role('font-name-language').value).toBe('');
  expect(f.focus).toBe(0);
  expect(f.statuses.length).toBe(0);
  f.tool.dispose();
});
test('IME·229·defaultPrevented·Tab·Escape 경계를 공통 모달과 보존한다', async () => {
  const f = fixture();
  f.open();
  f.language('latin');
  f.input('새 이름');
  const dialog = f.role('font-name-dialog'),
    input = f.role('font-name-input');
  fire(dialog, 'compositionstart');
  key(dialog, { key: 'Enter', target: input, isComposing: false });
  key(dialog, { key: 'Escape', isComposing: false });
  expect(dialog.open).toBe(true);
  expect(f.calls.length).toBe(0);
  fire(dialog, 'compositionend');
  key(dialog, { key: 'Enter', target: input, keyCode: 229 });
  expect(f.calls.length).toBe(0);
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value: 'Enter' });
  Object.defineProperty(event, 'target', { value: input });
  event.preventDefault();
  dialog.dispatchEvent(event);
  expect(f.calls.length).toBe(0);
  const cancel = f.role('font-name-cancel');
  cancel.focus();
  key(dialog, { key: 'Tab', shiftKey: false });
  expect(f.doc.activeElement).toBe(f.role('dialog-dismiss'));
  key(dialog, { key: 'Tab', shiftKey: true });
  expect(f.doc.activeElement).toBe(cancel);
  key(dialog, { key: 'Escape', keyCode: 27 });
  expect(f.focus).toBe(1);
  await tick();
  expect(f.calls.length).toBe(0);
  f.tool.dispose();
});

test('새 관측 필드가 없는 포트는 기본값을 만들지 않고 열기를 거부한다', () => {
  const f = fixture();
  f.api.observe = () => ({ target: f.state.selection });
  expect(f.open()).toBe(false);
  expect(f.root.children.length).toBe(0);
  expect(f.statuses).toEqual(['FontNameObservationUnavailable']);
  expect(f.calls.length).toBe(0);
  f.tool.dispose();
});
test('Native 거부는 초안을 유지하고 자동 재접수나 성공 안내를 하지 않는다', async () => {
  const f = fixture({ dispatch: () => ({ status: 'unapplied', error: 'ReadOnlyDocument' }) });
  f.open();
  f.language('latin');
  f.input('새 이름');
  f.apply();
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.role('font-name-dialog').open).toBe(true);
  expect(f.role('font-name-input').value).toBe('새 이름');
  expect(f.statuses.length).toBe(0);
  expect(f.focus).toBe(0);
  f.tool.dispose();
});
test('처리 성공이지만 refresh필요면 재시도하지 않고 확인 안내를 유지한다', async () => {
  const f = fixture({ dispatch: () => ({ status: 'committed-refresh-required' }) });
  f.open();
  f.language('latin');
  f.input('새 이름');
  f.apply();
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.role('font-name-dialog').open).toBe(true);
  expect(f.role('font-name-status').textContent).toContain('반영됐지만');
  expect(f.role('font-name-apply').disabled).toBe(true);
  f.apply();
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.focus).toBe(0);
  expect(f.statuses.length).toBe(0);
  f.tool.dispose();
});
test('알 수 없는 언어와 문서 없음은 명령을 접수하지 않는다', async () => {
  const f = fixture();
  f.open();
  f.language('ko');
  expect(f.role('font-name-language').value).toBe('');
  f.apply();
  await tick();
  expect(f.calls.length).toBe(0);
  f.tool.dispose();
  const empty = fixture({ status: 'empty' });
  expect(empty.open()).toBe(false);
  expect(empty.root.children.length).toBe(0);
  empty.tool.dispose();
});

test('no-op은 tagged single의 정확문자열만이며 placeholder·카탈로그·정규화는 비교기준이 아니다', async () => {
  for (const [value, placeholder] of [
    [{ kind: 'mixed' }, '서로 다른 글꼴'],
    [{ kind: 'unknown' }, '알 수 없음'],
    [{ kind: 'single', name: null }, '원본 이름을 확인할 수 없음'],
  ] as const) {
    for (const name of ['원본 latin', placeholder]) {
      // 이력 동등성 판정만 분리하는 fake 포트다. 실제 unknown 쓰기 사유 거부는 별도 검사한다.
      const f = fixture({ values: { latin: value } });
      f.open();
      f.language('latin');
      f.input(name);
      expect(f.role('font-name-apply').disabled).toBe(false);
      f.apply();
      await tick();
      expect(f.calls.length).toBe(1);
      expect(f.calls[0].payload.name).toBe(name);
      f.tool.dispose();
    }
  }
  for (const [original, name] of [
    [' A ', 'A'],
    ['é', 'e\u0301'],
  ]) {
    const f = fixture({ values: { latin: { kind: 'single', name: original } } });
    f.open();
    f.language('latin');
    f.input(name);
    expect(f.role('font-name-apply').disabled).toBe(false);
    f.apply();
    await tick();
    expect(f.calls.length).toBe(1);
    expect(f.calls[0].payload.name).toBe(name);
    f.tool.dispose();
  }
});

test('실제 core의 committed-refresh-required+error는 실패나 재접수 상태가 아니다', async () => {
  for (const publishRefresh of [false, true]) {
    let f: ReturnType<typeof fixture>;
    const result = {
      status: 'committed-refresh-required',
      error: 'SnapshotMissing',
      state: null as any,
    };
    f = fixture({
      dispatch() {
        if (publishRefresh)
          f.publish({ ...f.state, status: 'refresh-required', operationRevision: 1 });
        result.state = f.state;
        return result;
      },
    });
    f.open();
    f.language('latin');
    f.input('새 이름');
    f.apply();
    await tick();
    expect(f.calls.length).toBe(1);
    expect(f.results[0]).toBe(result);
    expect(f.role('font-name-dialog').open).toBe(true);
    expect(f.role('font-name-status').textContent).toContain('반영됐지만');
    expect(f.role('font-name-apply').disabled).toBe(true);
    f.apply();
    await tick();
    expect(f.calls.length).toBe(1);
    expect(f.focus).toBe(0);
    f.tool.dispose();
  }
});
test('view dispose 예외에도 소유권·포커스·presentation 정리를 마친다', () => {
  let cancel!: () => void;
  let presentations = 0;
  const f = fixture({
    onPresentationChange() {
      presentations++;
    },
    createView(root: HTMLElement, callbacks: any) {
      cancel = callbacks.onCancel;
      const view = createFontNameView(root, callbacks);
      return {
        ...view,
        dispose() {
          view.dispose();
          throw Error('InjectedViewDispose');
        },
      };
    },
  });
  f.open();
  expect(() => cancel()).not.toThrow();
  expect(f.focus).toBe(1);
  expect(presentations).toBe(2);
  expect(f.errors.length).toBe(1);
  expect(f.root.children.length).toBe(0);
  expect(f.calls.length).toBe(0);
  f.tool.dispose();
  expect(f.listeners.size).toBe(0);
});
