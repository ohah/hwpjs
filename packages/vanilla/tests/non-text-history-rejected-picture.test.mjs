// 실제 Canvas/Surface와 통제 Core 응답을 쓰는 보기 수명 반례 후보. 아직 실행하지 않았다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './non-text-history-fixture.mjs';
import { createCanvasSurface } from '../src/surface.ts';
const tick = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
test('Core 거부와 동일 상태는 현재 유효한 그림 선택을 지우지 않아야 함', async () => {
  const f = fixture();
  const picture = {
    section: 0,
    pictureNode: 7,
    geometry: { width: 7200, height: 3600, widthRelative: 4, heightRelative: 2 },
  };
  f.install({ content: { ...f.state().content, pictures: [picture] } });
  const readSelected = f.renderer.selectedPicture;
  f.renderer.selectedPicture = () => {
    const selected = readSelected();
    return selected
      ? (f
          .state()
          .content.pictures.find(
            (p) => p.section === selected.section && p.pictureNode === selected.pictureNode,
          ) ?? null)
      : null;
  };
  const surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    onStatus: (s) => f.reports.push(s),
  });
  f.attach(surface);
  try {
    const event = new Event('pointerdown', { cancelable: true });
    Object.assign(event, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    f.canvas().dispatchEvent(event);
    await tick();
    const before = f.state();
    assert.equal(surface.getContextPicture()?.pictureNode, 7);
    assert.equal(surface.requestHistory('undo'), true);
    assert.equal(f.requests.length, 1);
    const owned = f.waits.shift();
    owned.resolve({
      status: 'rejected-unapplied',
      state: before,
      changed: null,
      error: 'ReadOnlyDocument',
    });
    await tick();
    assert.equal(f.state(), before, '거부는 같은 Core 관측을 유지');
    assert.equal(surface.getContextPicture()?.pictureNode, 7, '유효한 현재 그림 표시 선택 유지');
    assert.equal(f.requests.length, 1, '추가 이력 접수 없음');
  } finally {
    const disposed = surface.dispose();
    while (f.waits.length) f.reject();
    await disposed;
  }
});
