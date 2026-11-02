import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, show } from './undo-onset-renderer-fixture.mjs';
const stage = (h, current = () => true) => {
  show(h, 'AB', { deferLayout: true });
  assert.equal(
    h.renderer.stageQueuedTypingPreview({ section: 0, paragraph: 0, text: 'ABCD' }, current),
    true,
  );
  h.renderer.select(
    {
      anchor: { section: 0, paragraph: 0, unit: 4 },
      focus: { section: 0, paragraph: 0, unit: 4 },
      active: false,
    },
    true,
  );
};
test('held rAF는 oldframe 유지/재예약0, 명시 geometry는 fresh 복귀', (t) => {
  const h = harness(t);
  show(h, 'A');
  h.paint();
  const old = h.renderer.paintedFrame(),
    before = h.layouts;
  let guards = 0;
  stage(h, () => {
    guards++;
    return true;
  });
  h.paint();
  assert.equal(h.layouts, before);
  assert.equal(guards, 1);
  assert.equal(h.renderer.isPaintedFrameCurrent(), false);
  assert.equal(h.renderer.paintedFrame(), old);
  h.paint();
  assert.equal(guards, 1);
  assert.equal(h.renderer.layout().rows.find((r) => r.kind === 'text').text, 'ABCD');
  assert.equal(h.layouts, before + 1);
});
test('scroll/selection/resize/font/scale/show/clear는 held를 해제', (t) => {
  const actions = [
    (h) => h.viewport.dispatchEvent(new Event('scroll')),
    (h) => h.renderer.select({ active: false }),
    (h) => h.resize(),
    (h) => h.fonts.dispatchEvent(new Event('loadingdone')),
    (h) => h.renderer.setViewScale(1.25),
    (h) => show(h, 'OTHER', { deferLayout: true }),
    (h) => h.renderer.clear(),
    (h) => h.renderer.pictureReader(async () => new Uint8Array()),
    (h) => h.renderer.pictureDecoder(async () => ({})),
  ];
  for (const [index, action] of actions.entries()) {
    const h = harness(t);
    show(h, 'A');
    h.paint();
    stage(h);
    action(h);
    h.paint();
    assert.equal(h.renderer.isPaintedFrameCurrent(), true, 'action ' + index);
  }
});
test('owner predicate false/throw/reentrant clear 또는 close는 stale hold를 승인하지 않음', (t) => {
  for (const mode of ['false', 'throw', 'clear', 'close']) {
    const h = harness(t);
    show(h, 'A');
    h.paint();
    const before = h.layouts;
    stage(h, () => {
      if (mode === 'throw') throw Error('guard');
      if (mode === 'clear') h.renderer.clear();
      if (mode === 'close') h.renderer.close();
      return mode === 'false' ? false : true;
    });
    h.paint();
    if (mode === 'false' || mode === 'throw') assert.ok(h.layouts > before);
    else if (mode === 'clear') assert.equal(h.renderer.layout().rows.length, 0);
    else assert.equal(h.renderer.isPaintedFrameCurrent(), false);
  }
});
