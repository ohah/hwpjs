// 실제 Surface/Canvas 범위와 통제 Core 응답의 완료 후 읽기 전용 수명 검사다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';
async function run(body) {
  const f = formattingFixture();
  const s = createCanvasSurface({ root: f.root, editor: f.editor });
  try {
    await f.selectA();
    await body(f, s);
  } finally {
    while (f.waits.length) f.reject();
    await s.dispose();
  }
}
test('완료 boolean 뒤 같은 Core 상태에서 Canvas A가 B가 되면 재검사는 거부한다', async () =>
  run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    assert.equal(c.request({ kind: 'text-color', color: '#123456' }), true);
    await tick();
    f.ack();
    await tick();
    f.frame();
    await tick();
    const settled = await c.settle();
    assert.equal(settled.current, true);
    const recheck = () =>
      typeof c.settledCurrent === 'function' ? c.settledCurrent() : settled.current;
    assert.equal(recheck(), true);
    const same = f.state();
    await f.selectB();
    assert.equal(f.state(), same);
    assert.equal(
      recheck(),
      false,
      '과거 완료 boolean만으로 다른 Canvas 범위를 현재로 승인하면 안 된다',
    );
    assert.equal(f.messages.length, 1);
  }));

test('완료 전은 거부하고 완료 뒤 현재 범위 반복 읽기는 요청을 늘리지 않는다', async () =>
  run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    assert.equal(c.settledCurrent(), false);
    assert.equal(c.request({ kind: 'text-color', color: '#123456' }), true);
    await tick();
    assert.equal(c.settledCurrent(), false);
    f.ack();
    await tick();
    await c.settle();
    for (let i = 0; i < 3; i++) assert.equal(c.settledCurrent(), true);
    assert.equal(f.messages.length, 1);
  }));
test('소유 모달 닫힘은 허용하지만 새 모달 재진입은 초점 현재성을 거부한다', async () =>
  run(async (f, s) => {
    const c = s.captureSelectionFormatting(),
      dialog = f.dialog();
    f.setDialogs([dialog]);
    assert.equal(c.bindDialog(dialog), true);
    assert.equal(c.request({ kind: 'text-color', color: '#123456' }), true);
    await tick();
    f.ack();
    await tick();
    await c.settle();
    assert.equal(c.settledCurrent(), true);
    dialog.open = false;
    dialog.isConnected = false;
    f.setDialogs([]);
    assert.equal(c.settledCurrent(), true);
    f.setDialogs([f.dialog()]);
    assert.equal(c.settledCurrent(), false);
  }));
test('문서 교체·공개 선택·새 본문·lease 해제는 완료 뒤 재승인하지 않는다', async () => {
  for (const invalidate of [
    (f) => f.install({ documentId: '새문서', generation: 2 }),
    (f) => f.install({ selection: { kind: 'paragraph', section: 0, paragraph: 2 } }),
    (f) =>
      f.install({
        content: {
          ...f.state().content,
          paragraphs: f
            .state()
            .content.paragraphs.map((p, i) => (i === 0 ? { ...p, text: '새본문' } : p)),
        },
      }),
    (f) => f.revoke(),
  ])
    await run(async (f, s) => {
      const c = s.captureSelectionFormatting();
      c.request({ kind: 'text-color', color: '#123456' });
      await tick();
      f.ack();
      await tick();
      await c.settle();
      assert.equal(c.settledCurrent(), true);
      invalidate(f);
      assert.equal(c.settledCurrent(), false);
      assert.equal(f.messages.length, 1);
    });
});
test('화면 관측 예외와 dispose는 false이며 원 결과는 그대로 보존한다', async () =>
  run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    c.request({ kind: 'text-color', color: '#123456' });
    await tick();
    f.ack();
    await tick();
    const settled = await c.settle();
    f.renderer.historyModelMatches = () => {
      throw Error('관측 실패');
    };
    assert.equal(c.settledCurrent(), false);
    assert.equal((await c.settle()).result, settled.result);
    await s.dispose();
    assert.equal(c.settledCurrent(), false);
  }));
test('결과 없는 통신 예외는 완료 현재성을 만들지 않는다', async () =>
  run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    c.request({ kind: 'text-color', color: '#123456' });
    await tick();
    f.reject();
    await tick();
    assert.equal((await c.settle()).result, null);
    assert.equal(c.settledCurrent(), false);
  }));
