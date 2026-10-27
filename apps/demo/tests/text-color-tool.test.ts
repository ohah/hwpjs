import { test, expect } from 'bun:test';
import { getSelectionFormatting, SET_CHARACTER_TEXT_COLOR_COMMAND } from '@hwpjs/core';
import { createTextColorTool } from '../src/text-color-tool.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
const tick = () => new Promise((resolve) => setImmediate(resolve));
function state(options: any = {}) {
  const token = {
    editorId: 'color',
    documentId: options.doc ?? 'doc',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
  };
  return {
    ...token,
    token,
    status: 'ready',
    stateVersion: options.version ?? 1,
    selection: {
      ...token,
      coordinateSpace: 'display',
      format: 'hwpx',
      owner: 'section:0:body',
      section: 0,
      paragraph: 0,
      startUnit: 0,
      endUnit: options.caret ? 0 : 2,
      affinity: 'forward',
    },
    content: {
      format: 'hwpx',
      readOnly: options.readonly,
      characterTextColorAvailable: !options.unsupported,
      characterTextColors: [
        { id: 0, color: options.unknown ? null : 0x123456 },
        { id: 1, color: 0xff0000 },
      ],
      paragraphs: [
        {
          section: 0,
          paragraph: 0,
          text: 'AB',
          selectionOwner: 'section:0:body',
          editable: !options.readonly,
          characterRanges: options.mixed
            ? [
                { start: 0, end: 1, charShapeId: 0 },
                { start: 1, end: 2, charShapeId: 1 },
              ]
            : [{ start: 0, end: 2, charShapeId: 0 }],
        },
      ],
    },
  } as any;
}
function fixture(options: any = {}) {
  const dom = documentFixture(),
    listeners = new Set<() => void>(),
    calls: any[] = [],
    statuses: string[] = [],
    errors: unknown[] = [];
  let current = state(options),
    focus = 0,
    presentations = 0;
  const editor: any = {
    getEditorState: () => current,
    registerStateListener(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    update: async () => {
      if (options.barrier) await options.barrier();
    },
    dispatchCommand: async (command: unknown, payload: unknown) => {
      calls.push({ command, payload });
      return options.dispatch
        ? options.dispatch()
        : { status: 'committed-with-snapshot', state: current, changed: true };
    },
  };
  const tool = createTextColorTool({
    root: dom.root as any,
    editor,
    onStatus: (s) => statuses.push(s),
    onClose: () => {
      focus++;
    },
    onPresentationChange: () => {
      presentations++;
    },
    onResult: options.onResult,
    onUIError: (e) => errors.push(e),
  });
  return {
    ...dom,
    tool,
    editor,
    calls,
    statuses,
    errors,
    open: () => tool.action('text-color'),
    draft(value: string) {
      dom.role('text-color-input').value = value;
      fire(dom.role('text-color-input'), 'input');
    },
    apply: () => fire(dom.role('text-color-apply'), 'click'),
    publish(next: any) {
      current = state(next);
      for (const fn of listeners) fn();
    },
    get focus() {
      return focus;
    },
    get presentations() {
      return presentations;
    },
  };
}
test('표준 조회/혼합/unknown은 검정 기본값 없이 표시한다', () => {
  for (const [options, expected] of [
    [{}, '#123456'],
    [{ mixed: true }, '혼합'],
    [{ unknown: true }, '알 수 없음'],
  ] as const) {
    const f = fixture(options);
    expect(getSelectionFormatting(f.editor.getEditorState()).textColorAvailableReason).toBeNull();
    f.open();
    expect(f.role('text-color-current').textContent).toContain(expected);
    if (options.mixed || options.unknown) expect(f.role('text-color-input').value).toBe('');
    f.draft('#abcdef');
    expect(f.role('text-color-apply').disabled).toBe(false);
    f.tool.dispose();
  }
});
test('dirty0/같은 색/잘못된 색/취소는 명령0', () => {
  const f = fixture();
  f.open();
  expect(f.role('text-color-apply').disabled).toBe(true);
  for (const value of ['red', '#12345', '#1234567', ' #123456', '#12GG00']) {
    f.draft(value);
    f.apply();
    expect(f.calls.length).toBe(0);
  }
  f.draft('#123456');
  expect(f.role('text-color-apply').disabled).toBe(true);
  f.apply();
  expect(f.calls.length).toBe(0);
  fire(f.role('text-color-cancel'), 'click');
  expect(f.role('text-color-dialog')).toBeUndefined();
  expect(f.focus).toBe(1);
  f.tool.dispose();
});
test('적용은 동일 typed identity/target/color 한 명령', async () => {
  const f = fixture();
  f.open();
  f.draft('#aBcDeF');
  f.apply();
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.calls[0].command).toBe(SET_CHARACTER_TEXT_COLOR_COMMAND);
  expect(f.calls[0].payload.color).toBe('#abcdef');
  expect(f.calls[0].payload.target.owner).toBe('section:0:body');
  expect(f.role('text-color-dialog')).toBeUndefined();
  f.tool.dispose();
});
test('readonly/caret/지원없음은 관측만 가능하며 적용0', async () => {
  for (const opts of [{ readonly: true }, { caret: true }, { unsupported: true }]) {
    const f = fixture(opts);
    f.open();
    f.draft('#abcdef');
    expect(f.role('text-color-apply').disabled).toBe(true);
    f.apply();
    await tick();
    expect(f.calls.length).toBe(0);
    fire(f.role('text-color-cancel'), 'click');
    f.tool.dispose();
  }
});
test('새 문서와 같은 문서의 선택 관측 변경은 captured 적용 거부', async () => {
  for (const next of [{ doc: 'other' }, { version: 2 }]) {
    const f = fixture();
    f.open();
    f.draft('#abcdef');
    f.publish(next);
    f.apply();
    await tick();
    expect(f.calls.length).toBe(0);
    expect(f.role('text-color-apply').disabled).toBe(true);
    fire(f.role('text-color-cancel'), 'click');
    if (next.doc) expect(f.focus).toBe(0);
    f.tool.dispose();
  }
});
test('barrier 동안 선택 변경도 명령0', async () => {
  let settle: () => void = () => {};
  const f = fixture({
    barrier: () =>
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
  });
  f.open();
  f.draft('#abcdef');
  f.apply();
  f.publish({ version: 2 });
  settle();
  await tick();
  expect(f.calls.length).toBe(0);
  f.tool.dispose();
});
test('pending 중 반복 적용/닫기 거부와 dispose 후 늦은 callback0', async () => {
  let settle: (r: any) => void = () => {};
  const f = fixture({
    dispatch: () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  });
  f.open();
  f.draft('#abcdef');
  f.apply();
  await tick();
  f.apply();
  fire(f.role('text-color-dialog'), 'cancel');
  expect(f.calls.length).toBe(1);
  expect(f.role('text-color-dialog').open).toBe(true);
  f.tool.dispose();
  const count = [f.presentations, f.statuses.length, f.focus];
  settle({ status: 'committed-with-snapshot' });
  await tick();
  expect([f.presentations, f.statuses.length, f.focus]).toEqual(count);
});
test('실패는 초안 보존, 성공 callback throw는 재편집하지 않는다', async () => {
  const bad = fixture({
    dispatch: async () => ({ status: 'rejected-unapplied', error: 'NativeDenied' }),
  });
  bad.open();
  bad.draft('#abcdef');
  bad.apply();
  await tick();
  expect(bad.role('text-color-input').value).toBe('#abcdef');
  expect(bad.role('text-color-status').textContent).toBe('NativeDenied');
  bad.tool.dispose();
  const f = fixture({
    onResult: () => {
      throw Error('UIFailure');
    },
  });
  f.open();
  f.draft('#abcdef');
  f.apply();
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.errors.length).toBe(1);
  expect(f.role('text-color-dialog')).toBeUndefined();
  f.tool.dispose();
});
test('조합 중 flag 없는 Escape/native cancel/Enter 및229는 편집·닫기0', async () => {
  const f = fixture();
  f.open();
  f.draft('#abcdef');
  const layer = f.role('text-color-dialog');
  fire(layer, 'compositionstart');
  fire(layer, 'keydown', { key: 'Escape' });
  fire(layer, 'cancel');
  fire(layer, 'keydown', { key: 'Enter', keyCode: 229 });
  f.apply();
  await tick();
  expect(f.calls.length).toBe(0);
  expect(layer.open).toBe(true);
  fire(layer, 'compositionend');
  fire(layer, 'keydown', { key: 'Escape' });
  expect(f.role('text-color-dialog')).toBeUndefined();
  f.tool.dispose();
});
test('Tab 순환은 공통 layer 경계를 사용한다', () => {
  const f = fixture();
  f.open();
  const layer = f.role('text-color-dialog');
  f.role('text-color-cancel').focus();
  fire(layer, 'keydown', { key: 'Tab' });
  expect(f.doc.activeElement.dataset.role).toBe('dialog-dismiss');
  fire(layer, 'keydown', { key: 'Tab', shiftKey: true });
  expect(f.doc.activeElement.dataset.role).toBe('text-color-cancel');
  f.tool.dispose();
});

test('일반 Enter는 한 번 적용하고 조합 밖229는 적용하지 않는다', async () => {
  const f = fixture();
  f.open();
  f.draft('#abcdef');
  const layer = f.role('text-color-dialog');
  const enter = (keyCode: number) => {
    const event = new Event('keydown', { cancelable: true });
    Object.defineProperties(event, {
      key: { value: 'Enter' },
      keyCode: { value: keyCode },
      target: { value: f.role('text-color-input') },
    });
    layer.dispatchEvent(event);
  };
  enter(229);
  await tick();
  expect(f.calls.length).toBe(0);
  enter(13);
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.role('text-color-dialog')).toBeUndefined();
  f.tool.dispose();
});
