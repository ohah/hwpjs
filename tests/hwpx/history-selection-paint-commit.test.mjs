import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../../web/preview/renderer.mjs';
import { createHistoryPaintBarrier } from '../../web/preview/history-paint-authority.mjs';
const tick = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const selection = (unit) => ({
  anchor: { section: 0, paragraph: 0, unit },
  focus: { section: 0, paragraph: 0, unit },
});
function fixture(t) {
  const frames = new Map(),
    timers = new Set(),
    fills = [];
  let id = 0,
    onLayout = () => {},
    onGeometry = () => {};
  const ctx = new Proxy(
    {
      font: '16px serif',
      measureText: (text) => ({
        width: [...text].length * 8,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
      }),
      fillRect(...args) {
        fills.push({ style: this.fillStyle, args });
      },
    },
    { get: (o, k) => o[k] ?? (() => {}) },
  );
  const doc = {
    defaultView: {
      AbortController,
      navigator: { platform: 'test' },
      setInterval: (fn, ms) => {
        const h = setInterval(fn, ms);
        timers.add(h);
        return h;
      },
      clearInterval: (h) => {
        clearInterval(h);
        timers.delete(h);
      },
      setTimeout,
      clearTimeout,
      requestAnimationFrame: (fn) => {
        frames.set(++id, fn);
        return id;
      },
      cancelAnimationFrame: (n) => frames.delete(n),
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
    },
  };
  class Element extends EventTarget {
    ownerDocument = doc;
    style = {};
    dataset = {};
    scrollTop = 0;
    scrollLeft = 0;
    clientWidth = 800;
    clientHeight = 600;
    getContext() {
      return ctx;
    }
    getBoundingClientRect() {
      return { x: 0, y: 0, width: 800, height: 600 };
    }
  }
  const canvas = new Element(),
    viewport = new Element(),
    spacer = new Element();
  const renderer = createRenderer(canvas, viewport, spacer, (...args) => onLayout(...args));
  renderer.onGeometry(() => onGeometry());
  const content = {
    format: 'hwpx',
    paragraphs: [{ section: 0, paragraph: 0, text: 'AB', editable: true, selectable: true }],
    limited: false,
  };
  renderer.show(content, { resourceDocument: 'doc-a', resourceEpoch: 0, preserveScroll: true });
  const frame = () => {
    const next = frames.entries().next().value;
    assert(next, '실제 renderer가 frame을 요청해야 합니다.');
    frames.delete(next[0]);
    fills.length = 0;
    next[1](0);
  };
  t.after(() => {
    renderer.close();
    assert.equal(timers.size, 0);
    assert.equal(frames.size, 0);
  });
  return {
    renderer,
    canvas,
    fills,
    frame,
    frames,
    content,
    setLayout(fn) {
      onLayout = fn;
    },
    setGeometry(fn) {
      onGeometry = fn;
    },
  };
}
test('실 renderer는 일반 frame-current와 별도로 선택 paint를 확인한다', (t) => {
  const f = fixture(t),
    a = selection(0),
    b = selection(1);
  f.renderer.select({ ...a, active: true });
  assert.equal(f.renderer.isSelectionPainted(a), false);
  f.frame();
  assert.equal(f.renderer.isSelectionPainted(a), true);
  f.renderer.select({ ...b, active: true });
  assert.equal(f.renderer.isPaintedFrameCurrent(), true);
  assert.equal(f.renderer.isSelectionPainted(b), false);
  f.frame();
  assert.equal(f.renderer.isSelectionPainted(b), true);
});
test('공개 mutable paintedFrame 선택을 위조해도 private paint 권한은 바뀌지 않는다', (t) => {
  const f = fixture(t),
    a = selection(0),
    b = selection(1);
  f.renderer.select({ ...a, active: true });
  f.frame();
  f.renderer.paintedFrame().selection.focus.unit = 1;
  assert.equal(f.renderer.isSelectionPainted(a), true);
  assert.equal(f.renderer.isSelectionPainted(b), false);
});
test('pending paint는 표준 파란 caret를 그리지 않고 ACK 선택 paint 뒤에만 유효하다', (t) => {
  const f = fixture(t),
    a = selection(1);
  f.renderer.select({ ...a, active: true });
  f.frame();
  assert.equal(f.canvas.dataset.paintedCaret, '0:0:1');
  f.renderer.select({ ...a, active: true, historyPending: true });
  f.frame();
  assert.equal(f.canvas.dataset.paintedCaret, '');
  assert.equal(f.renderer.isSelectionPainted(a), false);
  assert.equal(f.fills.filter((x) => x.style === '#145b96' && x.args[2] === 2).length, 0);
  f.renderer.select({ ...a, active: true, historyPending: false });
  assert.equal(f.renderer.isSelectionPainted(a), false);
  f.frame();
  assert.equal(f.renderer.isSelectionPainted(a), true);
});
test('같은 선택의 이미 유효한 frame은 새 frame 없이 재사용한다', (t) => {
  const f = fixture(t),
    a = selection(1);
  f.renderer.select({ ...a, active: true });
  f.frame();
  f.renderer.select({ ...a, active: true });
  assert.equal(f.renderer.isSelectionPainted(a), true);
});
test('onGeometry 이후 paint 후처리 오류가 나면 queued 입력 권한을 게시하지 않는다', async (t) => {
  const f = fixture(t),
    a = selection(1);
  let fail = false,
    geometry = false,
    releases = 0;
  const barrier = createHistoryPaintBarrier({
    isPainted: (s) => f.renderer.isSelectionPainted(s),
    release: () => releases++,
  });
  f.setGeometry(() => {
    geometry = true;
    barrier.notify();
  });
  f.setLayout(() => {
    if (fail && geometry) throw Error('paint 후처리 실패');
  });
  f.renderer.select({ ...a, active: true });
  barrier.begin();
  barrier.acknowledge(a);
  fail = true;
  assert.throws(f.frame, /paint 후처리 실패/);
  await tick();
  assert.equal(f.renderer.isSelectionPainted(a), false);
  assert.equal(releases, 0);
  fail = false;
  f.renderer.select({ ...a, active: true });
  f.frame();
  await tick();
  assert.equal(releases, 1);
});
test('paint 도중 재진입한 새 선택은 다음 완성 frame에서만 게시한다', (t) => {
  const f = fixture(t),
    a = selection(0),
    b = selection(1);
  let once = true;
  f.setGeometry(() => {
    if (once) {
      once = false;
      f.renderer.select({ ...b, active: true });
    }
  });
  f.renderer.select({ ...a, active: true });
  f.frame();
  assert.equal(f.renderer.isSelectionPainted(b), false);
  f.frame();
  assert.equal(f.renderer.isSelectionPainted(b), true);
});
test('문서 교체는 같은 좌표의 이전 frame을 유효하게 만들지 않는다', (t) => {
  const f = fixture(t),
    a = selection(1);
  f.renderer.select({ ...a, active: true });
  f.frame();
  assert.equal(f.renderer.isSelectionPainted(a), true);
  f.renderer.show(
    { ...f.content, paragraphs: f.content.paragraphs.map((p) => ({ ...p, text: 'CD' })) },
    { resourceDocument: 'doc-b', resourceEpoch: 0, preserveScroll: true },
  );
  assert.equal(f.renderer.isSelectionPainted(a), false);
});
