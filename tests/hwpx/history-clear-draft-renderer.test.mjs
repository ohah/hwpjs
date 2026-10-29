import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../../web/preview/renderer.mjs';
const arm = 'candidate';
const content = (text = 'AB') => ({
  format: 'hwpx',
  paragraphs: [{ section: 0, paragraph: 0, text, editable: true, selectable: true }],
  limited: false,
});
function harness(t) {
  const frames = [];
  let layouts = 0;
  const paints = [];
  const ctx = new Proxy(
    {
      measureText: (text) => ({
        width: text.length * 8,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 2,
      }),
      fillText(text) {
        paints.push(text);
      },
    },
    { get: (o, k) => o[k] ?? (() => {}) },
  );
  const canvas = { getContext: () => ctx, style: {}, dataset: {}, width: 800, height: 600 };
  const viewport = {
    clientWidth: 800,
    clientHeight: 600,
    scrollTop: 0,
    scrollLeft: 0,
    addEventListener() {},
    removeEventListener() {},
  };
  const renderer = createRenderer(
    canvas,
    viewport,
    { style: {} },
    () => {
      layouts++;
    },
    {
      requestFrame: (f) => (frames.push(f), frames.length),
      cancelFrame() {},
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
      setInterval: () => 1,
      clearInterval() {},
    },
  );
  t.after(() => renderer.close());
  return {
    renderer,
    canvas,
    paints,
    count: () => layouts,
    flush() {
      let n = 0;
      while (frames.length) {
        assert(++n < 20);
        frames.shift()();
      }
    },
  };
}
const clear = (r) => (r.clearDraft ? r.clearDraft() : r.preview(null));
const snapshot = (r) => JSON.parse(JSON.stringify(r.layout()));
test('실 renderer 64개 이력 모델 게시 뒤 초안 제거는 같은 레이아웃을 보존한다', (t) => {
  const h = harness(t);
  h.renderer.show(content(), { resourceDocument: 'A', resourceEpoch: 0 });
  const start = h.count();
  for (let n = 64; n > 0; n--) {
    const c = content('A' + 'x'.repeat(n) + 'B');
    h.renderer.show(c, { resourceDocument: 'A', resourceEpoch: 65 - n, preserveScroll: true });
    const before = snapshot(h.renderer);
    clear(h.renderer);
    assert.deepEqual(snapshot(h.renderer), before);
  }
  const calls = h.count() - start;
  assert.equal(calls, arm === 'baseline' ? 128 : 64);
  console.log(
    JSON.stringify({
      arm,
      undoModels: 64,
      reflow: calls,
      scope: '실 renderer와 합성 ACK 모델, 실제 Native 아님',
    }),
  );
});
test('실 초안이 있으면 제거가 재계산하고 원문으로 돌아간다', (t) => {
  const h = harness(t);
  h.renderer.show(content());
  h.renderer.preview({ section: 0, paragraph: 0, text: 'AXXB' });
  const before = h.count();
  clear(h.renderer);
  assert.equal(h.count() - before, 1);
  assert.equal(h.renderer.paragraph({ section: 0, paragraph: 0 }).text, 'AB');
  h.flush();
  assert(!h.paints.includes('X'));
});
test('deferred ACK는 초안이 없어도 정확히 한 번 투영한다', (t) => {
  const h = harness(t);
  h.renderer.show(content(), { resourceDocument: 'A', resourceEpoch: 0 });
  const before = h.count();
  h.renderer.show(content('ACB'), { resourceDocument: 'A', resourceEpoch: 1, deferLayout: true });
  assert.equal(h.count(), before);
  clear(h.renderer);
  assert.equal(h.count() - before, 1);
  assert.equal(h.renderer.paragraph({ section: 0, paragraph: 0 }).text, 'ACB');
});
test('기존 preview null은 외부 mutable 모델의 재계산 의미를 유지한다', (t) => {
  const h = harness(t),
    c = content();
  h.renderer.show(c);
  c.paragraphs[0].text = 'AZB';
  const before = h.count();
  h.renderer.preview(null);
  assert.equal(h.count() - before, 1);
  h.flush();
  assert(h.paints.includes('Z'));
});
test('초안 제거 뒤 선택은 실제 paint 전에는 미확정이고 frame 후 확정된다', (t) => {
  const h = harness(t);
  h.renderer.show(content(), { resourceDocument: 'A', resourceEpoch: 0 });
  h.flush();
  h.renderer.show(content('ACB'), { resourceDocument: 'A', resourceEpoch: 1 });
  clear(h.renderer);
  const s = {
    anchor: { section: 0, paragraph: 0, unit: 2 },
    focus: { section: 0, paragraph: 0, unit: 2 },
    active: true,
  };
  h.renderer.select(s);
  assert.equal(h.renderer.isSelectionPainted(s), false);
  h.flush();
  assert.equal(h.renderer.isSelectionPainted(s), true);
});
test('문서 교체는 같은 텍스트라도 새 모델을 게시한다', (t) => {
  const h = harness(t);
  h.renderer.show(content(), { resourceDocument: 'A', resourceEpoch: 0 });
  h.flush();
  const before = h.count();
  h.renderer.show(content(), { resourceDocument: 'B', resourceEpoch: 0 });
  clear(h.renderer);
  assert.equal(h.count() - before, arm === 'baseline' ? 2 : 1);
  assert.equal(h.renderer.isPaintedFrameCurrent(), false);
  h.flush();
  assert.equal(h.renderer.isPaintedFrameCurrent(), true);
});
