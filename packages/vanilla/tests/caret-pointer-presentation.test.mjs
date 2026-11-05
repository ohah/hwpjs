// 실제 Surface/Canvas와 통제 Core ACK 순서의 표시 회귀다. Native 실행이 아니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';
test('드래그 중 선택 ACK 뒤 pointerup에서 현재 caret 입력 서식 표시를 갱신한다', async () => {
  const f = formattingFixture();
  for (const key of [
    'characterPropertyTextAvailable',
    'namedFontTextAvailable',
    'namedFontPropertyTextAvailable',
  ])
    f.renderer[key] = () => true;
  const acquire = f.editor.acquireInputSurface;
  f.editor.acquireInputSurface = (...args) => {
    const lease = acquire(...args);
    return {
      ...lease,
      publishSelection: async (selection) => {
        await tick();
        return lease.publishSelection(selection);
      },
    };
  };
  let surface;
  const presentations = [];
  const observe = () => {
    if (surface) presentations.push(Boolean(surface.captureCaretFormatting()));
  };
  const subscribe = f.editor.registerStateListener;
  f.editor.registerStateListener = (fn) =>
    subscribe((state) => {
      fn(state);
      observe();
    });
  surface = createCanvasSurface({ root: f.root, editor: f.editor, onStatus: observe });
  try {
    f.pointer('pointerdown', 0, 1);
    await tick();
    await tick();
    assert.equal(f.state().selection.startUnit, 1);
    assert.equal(presentations.at(-1), false);
    f.pointer('pointerup', 0, 1);
    await tick();
    assert(surface.captureCaretFormatting(), '현재 포트는 이미 준비됨');
    assert.equal(presentations.at(-1), true, 'pointerup 뒤 도구가 재조회해야 함');
    assert.equal(f.messages.length, 0);
  } finally {
    while (f.waits.length) f.reject();
    await surface.dispose();
  }
});

async function lifecycle(body) {
  const f = formattingFixture();
  for (const key of [
    'characterPropertyTextAvailable',
    'namedFontTextAvailable',
    'namedFontPropertyTextAvailable',
  ])
    f.renderer[key] = () => true;
  const reports = [];
  let surface;
  surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    onStatus: (message) => reports.push({ message, capture: surface?.captureCaretFormatting() }),
  });
  reports.length = 0;
  try {
    await body(f, surface, reports);
  } finally {
    while (f.waits.length) f.reject();
    await surface.dispose();
  }
}
test('실제 pointerup만 한 번 알리고 취소·중복 release는 표시 통지를 추가하지 않는다', () =>
  lifecycle(async (f, s, reports) => {
    f.pointer('pointerdown', 0, 1);
    await tick();
    f.pointer('pointercancel', 0, 1);
    await tick();
    assert.equal(reports.length, 0);
    f.pointer('pointerdown', 0, 1);
    await tick();
    f.pointer('pointerup', 0, 1);
    await tick();
    assert.equal(reports.length, 1);
    assert(reports[0].capture);
    f.pointer('pointerup', 0, 1);
    assert.equal(reports.length, 1);
    assert.equal(f.messages.length, 0);
  }));
test('범위 드래그와 IME 상태는 caret 쓰기 권한을 새로 만들지 않는다', () =>
  lifecycle(async (f, s, reports) => {
    f.pointer('pointerdown', 0, 0);
    f.pointer('pointermove', 0, 2);
    f.pointer('pointerup', 0, 2);
    await tick();
    assert.equal(reports.length, 0);
    assert.equal(s.captureCaretFormatting(), null);
    f.pointer('pointerdown', 0, 1);
    await tick();
    f.input().dispatchEvent(new Event('compositionstart'));
    f.pointer('pointerup', 0, 1);
    await tick();
    assert.equal(s.captureCaretFormatting(), null);
    assert(reports.every((x) => !x.capture));
    assert.equal(f.messages.length, 0);
  }));
test('표시 콜백의 문서 교체 재진입 뒤 이전 caret 캡처를 발급하지 않는다', async () => {
  const f = formattingFixture();
  for (const key of [
    'characterPropertyTextAvailable',
    'namedFontTextAvailable',
    'namedFontPropertyTextAvailable',
  ])
    f.renderer[key] = () => true;
  let surface,
    changed = false,
    after;
  surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    onStatus: (message) => {
      if (message === '커서 위치를 선택했습니다.' && !changed) {
        changed = true;
        f.install({ documentId: '다른 문서', generation: 2, selection: null });
        after = surface.captureCaretFormatting();
      }
    },
  });
  try {
    f.pointer('pointerdown', 0, 1);
    await tick();
    f.pointer('pointerup', 0, 1);
    await tick();
    assert.equal(changed, true);
    assert.equal(after, null);
    assert.equal(f.messages.length, 0);
  } finally {
    await surface.dispose();
  }
});
