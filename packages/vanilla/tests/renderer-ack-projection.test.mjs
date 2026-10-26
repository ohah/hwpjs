import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../../../web/preview/renderer.mjs';
import { createControlBridge } from '../../../packages/vanilla/src/core-bridge.ts';
import { createParagraphLookup } from '../../../web/preview/projection-paragraph-index.mjs';
function harness(t) {
  const frames = [],
    fonts = new EventTarget();
  let resize,
    ratio = 1,
    layouts = 0,
    measurements = 0;
  const ctx = new Proxy(
    {
      measureText: (text) => (
        measurements++,
        { width: text.length * 8, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 }
      ),
    },
    { get: (o, key) => o[key] ?? (() => {}) },
  );
  const canvas = {
    width: 300,
    height: 150,
    style: {},
    dataset: {},
    ownerDocument: { fonts },
    getContext: () => ctx,
    getBoundingClientRect: () => ({
      width: parseFloat(canvas.style.width),
      height: parseFloat(canvas.style.height),
    }),
  };
  const viewport = Object.assign(new EventTarget(), {
    clientWidth: 800,
    clientHeight: 600,
    scrollTop: 0,
    scrollLeft: 0,
  });
  const renderer = createRenderer(
    canvas,
    viewport,
    { style: {} },
    () => {
      layouts++;
    },
    {
      devicePixelRatio: () => ratio,
      requestFrame: (f) => (frames.push(f), frames.length),
      cancelFrame() {},
      ResizeObserver: class {
        constructor(f) {
          resize = f;
        }
        observe() {}
        disconnect() {}
      },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    },
  );
  t.after(() => renderer.close());
  return {
    renderer,
    canvas,
    viewport,
    fonts,
    get layouts() {
      return layouts;
    },
    get measurements() {
      return measurements;
    },
    resize: () => resize(),
    ratio: (v) => (ratio = v),
    paint() {
      let n = 0;
      while (frames.length) {
        assert(++n < 30);
        frames.shift()();
      }
    },
  };
}
const source = (text) => ({
  format: 'hwp5',
  paragraphs: Object.freeze([
    Object.freeze({
      section: 0,
      paragraph: 0,
      label: '문단',
      text,
      editable: true,
      selectable: true,
    }),
  ]),
  limited: false,
});
const show = (h, text, extra = {}) =>
  h.renderer.show(source(text), {
    resourceDocument: 'one',
    resourceEpoch: text,
    preserveScroll: true,
    ...extra,
  });
test('splice ACK 중간 show와 남은 draft를 동기 layout 한 번으로 합침', (t) => {
  const a = harness(t),
    b = harness(t);
  show(a, 'A');
  show(b, 'A');
  a.paint();
  b.paint();
  const beforeA = a.layouts,
    beforeB = b.layouts;
  show(a, 'AX');
  a.renderer.preview({ section: 0, paragraph: 0, text: 'AXYZ' });
  show(b, 'AX', { deferLayout: true });
  assert.equal(b.layouts, beforeB);
  assert.equal(b.renderer.paragraph({ section: 0, paragraph: 0 }).text, 'AX');
  assert.equal(b.renderer.isPaintedFrameCurrent(), false);
  b.renderer.preview({ section: 0, paragraph: 0, text: 'AXYZ' });
  assert.equal(a.layouts - beforeA, 2);
  assert.equal(b.layouts - beforeB, 1);
  assert.deepEqual(b.renderer.layout(), a.renderer.layout());
  b.paint();
  assert.equal(b.renderer.isPaintedFrameCurrent(), true);
});
test('draft가 없거나 callback이 예외여도 ACK finally는 최신 모델을 한 번 투영', (t) => {
  const h = harness(t);
  show(h, 'OLD');
  h.paint();
  const before = h.layouts;
  assert.throws(() => {
    try {
      show(h, 'NEW', { deferLayout: true });
      throw Error('관측자 예외');
    } finally {
      h.renderer.flushProjection();
    }
  }, /관측자/);
  assert.equal(h.layouts - before, 1);
  assert.equal(h.renderer.layout().rows.find((row) => row.kind === 'text').text, 'NEW');
  h.renderer.flushProjection();
  assert.equal(h.layouts - before, 1);
});
test('동기 geometry 읽기가 먼저 일어나면 즉시 flush하고 추가 draft reflow를 숨기지 않음', (t) => {
  const h = harness(t);
  show(h, 'A');
  h.paint();
  const before = h.layouts;
  show(h, 'AX', { deferLayout: true });
  assert.equal(h.renderer.layout().rows.find((row) => row.kind === 'text').text, 'AX');
  assert.equal(h.layouts - before, 1);
  h.renderer.preview({ section: 0, paragraph: 0, text: 'AXY' });
  assert.equal(h.layouts - before, 2);
});
test('pending 상태의 paint는 최신 source를 투영하고 stale pointer gate는 commit까지 닫힘', (t) => {
  const h = harness(t);
  show(h, 'A');
  h.paint();
  const old = h.renderer.paintedFrame();
  show(h, 'NEW', { deferLayout: true });
  assert.equal(h.renderer.isPaintedFrameCurrent(), false);
  assert.equal(h.renderer.paintedFrame(), old);
  h.paint();
  assert.equal(h.renderer.isPaintedFrameCurrent(), true);
  assert.equal(
    h.renderer.paintedFrame().layout.rows.find((row) => row.kind === 'text').text,
    'NEW',
  );
});
test('resize/font-ready/DPR/문서교체/clear가 pending 투영을 오래된 geometry로 재사용하지 않음', (t) => {
  const h = harness(t);
  show(h, 'A');
  h.paint();
  show(h, 'B', { deferLayout: true });
  h.viewport.clientWidth = 450;
  h.resize();
  assert.equal(h.renderer.layout().rows.find((row) => row.kind === 'text').text, 'B');
  show(h, 'C', { deferLayout: true });
  h.fonts.dispatchEvent(new Event('loadingdone'));
  assert.equal(h.renderer.layout().rows.find((row) => row.kind === 'text').text, 'C');
  h.ratio(2);
  assert.equal(h.renderer.isPaintedFrameCurrent(), false);
  h.paint();
  assert.equal(h.renderer.isPaintedFrameCurrent(), true);
  const before = h.layouts;
  show(h, 'OTHER', { deferLayout: true, resourceDocument: 'two' });
  assert.equal(h.layouts - before, 1);
  h.renderer.clear();
  assert.equal(h.renderer.layout().rows.length, 0);
});
test('실제 비동기 bridge의 pendingKind는 요청별 admission과 ACK 콜백을 유지', async (t) => {
  const h = harness(t);
  show(h, 'A');
  let state = {
      status: 'ready',
      documentId: 'one',
      generation: 1,
      operationRevision: 0,
      token: { documentId: 'one', generation: 1 },
    },
    ack = 0,
    native = 0;
  let bridge;
  const lease = {
    isActive: () => true,
    async request(_message) {
      native++;
      state = { ...state, operationRevision: 1 };
      assert.equal(bridge.pendingKind(), 'splice');
      show(h, 'AX', { deferLayout: bridge.pendingKind() === 'splice' });
      return { status: 'committed-with-snapshot', state, reply: { historyRevision: 1 } };
    },
  };
  bridge = createControlBridge({
    state: () => state,
    lease,
    acknowledge() {
      ack++;
      try {
        h.renderer.preview({ section: 0, paragraph: 0, text: 'AXY' });
      } finally {
        h.renderer.flushProjection();
      }
    },
    error: (e) => {
      throw e;
    },
  });
  assert.equal(bridge.request({ kind: 'splice', text: 'X' }), true);
  assert.equal(bridge.request({ kind: 'splice', text: 'Y' }), false);
  await bridge.flush();
  assert.equal(native, 1);
  assert.equal(ack, 1);
  assert.equal(bridge.pendingKind(), undefined);
  assert.equal(h.renderer.layout().rows.find((row) => row.kind === 'text').text, 'AXY');
});
test('불변 snapshot Map은 중복 ID 첫 항목/문서 교체를 보존하고 mutable 입력은 현재 값을 읽음', () => {
  const index = createParagraphLookup(),
    first = Object.freeze({ section: 0, paragraph: 1, text: 'first' }),
    second = Object.freeze({ section: 0, paragraph: 1, text: 'second' }),
    rows = Object.freeze([first, second]);
  assert.equal(index.find(rows, { section: 0, paragraph: 1 }), first);
  const mutable = { section: 0, paragraph: 2, text: 'old' },
    outer = Object.freeze([first, mutable]);
  assert.equal(index.find(outer, { section: 0, paragraph: 2 }).text, 'old');
  mutable.text = 'new';
  assert.equal(index.find(outer, { section: 0, paragraph: 2 }).text, 'new');
  assert.equal(index.find(Object.freeze([second]), { section: 0, paragraph: 1 }), second);
  index.clear();
  assert.equal(index.find(rows, { section: 0, paragraph: 1 }), first);
});
test('문서가 바뀐 뒤 늦은 ACK는 기존 bridge 세대 규칙으로 폐기', async (t) => {
  const h = harness(t);
  show(h, 'OLD');
  let resolveRequest,
    state = {
      status: 'ready',
      documentId: 'one',
      generation: 1,
      operationRevision: 0,
      token: { documentId: 'one', generation: 1 },
    },
    ack = 0;
  const bridge = createControlBridge({
    state: () => state,
    lease: {
      isActive: () => true,
      request: () => new Promise((resolve) => (resolveRequest = resolve)),
    },
    acknowledge() {
      ack++;
    },
    error: (e) => {
      throw e;
    },
  });
  bridge.request({ kind: 'splice', text: 'x' });
  await Promise.resolve();
  const previous = state;
  state = {
    status: 'ready',
    documentId: 'two',
    generation: 2,
    operationRevision: 0,
    token: { documentId: 'two', generation: 2 },
  };
  show(h, 'NEW DOC', { resourceDocument: 'two' });
  assert.equal(
    bridge.pendingKind(),
    undefined,
    '이전 문서의 pending kind를 새 문서에 적용하지 않음',
  );
  resolveRequest({
    status: 'committed-with-snapshot',
    state: previous,
    reply: { historyRevision: 1 },
  });
  await bridge.flush();
  assert.equal(ack, 0);
  assert.equal(h.renderer.paragraph({ section: 0, paragraph: 0 }).text, 'NEW DOC');
  assert.equal(bridge.pendingKind(), undefined);
});
test('잘못된 draft 투영 후에도 pointer는 닫혀 있고 명시 reset은 최신 ACK 모델로 복구', (t) => {
  const h = harness(t);
  show(h, 'OLD');
  h.paint();
  show(h, 'ACK', { deferLayout: true });
  assert.throws(() => h.renderer.preview({ section: 0, paragraph: 0, text: null }));
  assert.equal(h.renderer.isPaintedFrameCurrent(), false);
  h.renderer.preview(null);
  h.renderer.flushProjection();
  h.paint();
  assert.equal(h.renderer.isPaintedFrameCurrent(), true);
  assert.equal(h.renderer.layout().rows.find((r) => r.kind === 'text').text, 'ACK');
});
test('Map 부적격 frozen outer는 반복 전량 검증 없이 mutable row를 계속 관측', () => {
  for (const n of [32, 64, 128]) {
    let checks = 0;
    const rows = Object.freeze(
        Array.from({ length: n }, (_, i) => {
          const row = { section: 0, paragraph: i, text: 'x' };
          return i === n - 1
            ? row
            : new Proxy(Object.freeze(row), {
                getOwnPropertyDescriptor(o, k) {
                  checks++;
                  return Reflect.getOwnPropertyDescriptor(o, k);
                },
              });
        }),
      ),
      lookup = createParagraphLookup();
    lookup.find(rows, { section: 0, paragraph: n - 1 });
    const first = checks;
    assert(first > 0);
    for (let i = 0; i < n; i++) lookup.find(rows, { section: 0, paragraph: i });
    assert.equal(checks, first);
    rows[n - 1].text = '변경';
    assert.equal(lookup.find(rows, { section: 0, paragraph: n - 1 }).text, '변경');
  }
});
test('현재 snapshot 인덱스는4096문단상한을넘으면검증없이기존검색으로돌아감', () => {
  let checks = 0;
  const rows = Object.freeze(
      Array.from(
        { length: 4097 },
        (_, paragraph) =>
          new Proxy(Object.freeze({ section: 0, paragraph, text: String(paragraph) }), {
            getOwnPropertyDescriptor(o, k) {
              checks++;
              return Reflect.getOwnPropertyDescriptor(o, k);
            },
          }),
      ),
    ),
    lookup = createParagraphLookup();
  assert.equal(lookup.find(rows, { section: 0, paragraph: 4096 }).text, '4096');
  assert.equal(checks, 0);
  assert.equal(lookup.find(rows, { section: 0, paragraph: 0 }).text, '0');
  assert.equal(checks, 0);
});
for (const boundary of ['geometry', 'paint', 'ack-finally'])
  test('대기 splice와 다른 ready 투영도 최신 권위·' + boundary + ' 경계를 보존', async (t) => {
    const h = harness(t);
    show(h, 'A');
    h.paint();
    let state = {
        status: 'ready',
        documentId: 'one',
        generation: 1,
        operationRevision: 0,
        token: { documentId: 'one', generation: 1, operationRevision: 0 },
      },
      native = 0,
      requests = 0,
      acks = 0,
      errors = 0;
    const bridge = createControlBridge({
      state: () => state,
      lease: {
        isActive: () => true,
        async request(message, options) {
          requests++;
          if (options.token.operationRevision !== state.operationRevision)
            throw Error('StaleOperation');
          native++;
          return { status: 'committed-with-snapshot', state, reply: { historyRevision: 1 } };
        },
      },
      acknowledge(reply) {
        acks++;
        assert.equal(reply.applied, false);
        try {
          h.renderer.preview(null);
        } finally {
          h.renderer.flushProjection();
        }
      },
      error() {
        errors++;
      },
    });
    assert(bridge.request({ kind: 'splice', text: 'x' }));
    state = { ...state, operationRevision: 1, token: { ...state.token, operationRevision: 1 } };
    const before = h.layouts;
    show(h, 'OTHER', { deferLayout: bridge.pendingKind() === 'splice' });
    assert.equal(h.renderer.paragraph({ section: 0, paragraph: 0 }).text, 'OTHER');
    assert.equal(h.layouts, before);
    assert.equal(h.renderer.isPaintedFrameCurrent(), false);
    if (boundary === 'geometry')
      assert.equal(h.renderer.layout().rows.find((row) => row.kind === 'text').text, 'OTHER');
    else if (boundary === 'paint') h.paint();
    await bridge.flush();
    assert.equal(requests, 1);
    assert.equal(native, 0);
    assert.equal(acks, 1);
    assert.equal(errors, 1);
    assert.equal(h.renderer.layout().rows.find((row) => row.kind === 'text').text, 'OTHER');
    h.paint();
    assert.equal(h.renderer.isPaintedFrameCurrent(), true);
  });
test('부가 geometry 읽기도 최신 투영을 강제하며 painted frame 자체는 과거 commit으로 유지', (t) => {
  for (const read of [
    (h) => h.renderer.dutmalAtLogicalPoint(0, 0),
    (h) => h.renderer.equationAtLogicalPoint(0, 0),
    (h) => h.renderer.chartAtLogicalPoint(0, 0),
    (h) => h.renderer.adjacentCell({ section: 0, paragraph: 0 }, false),
    (h) => h.renderer.currentHwp5Choice(0, 1),
    (h) =>
      h.renderer.paragraph({
        section: 0,
        paragraph: 0,
        createdCell: { identity: 1, row: 0, column: 0 },
      }),
  ]) {
    const h = harness(t);
    show(h, 'A');
    h.paint();
    const frame = h.renderer.paintedFrame(),
      before = h.layouts;
    show(h, 'OTHER', { deferLayout: true });
    assert.equal(h.renderer.paintedFrame(), frame);
    read(h);
    assert.equal(h.layouts - before, 1);
    assert.equal(h.renderer.layout().rows.find((row) => row.kind === 'text').text, 'OTHER');
    assert.equal(h.renderer.isPaintedFrameCurrent(), false);
  }
});
