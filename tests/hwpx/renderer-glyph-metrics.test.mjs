import test from 'node:test';
import assert from 'node:assert/strict';
import { createRendererGlyphMetrics } from '../../web/preview/renderer-glyph-metrics.mjs';
import {
  createProjectionCanvasMetrics,
  PROJECTION_CANVAS_CONTEXT_FIELDS,
} from '../../web/preview/projection-measure-memo.mjs';
import { createPreviewTextMeasure } from '../../web/preview/preview-text-measure.mjs';
import { createTextStyle } from '../../web/preview/text-style.mjs';
import { layoutContent } from '../../web/preview/layout.mjs';
import { createRenderer } from '../../web/preview/renderer.mjs';

function context() {
  let font = '16px serif';
  const stack = [];
  const ctx = {
    calls: 0,
    epoch: 0,
    last: null,
    direction: 'ltr',
    fontKerning: 'auto',
    fontStretch: 'normal',
    fontVariantCaps: 'normal',
    letterSpacing: '0px',
    wordSpacing: '0px',
    textRendering: 'auto',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lang: 'ko',
    get font() {
      return font;
    },
    set font(value) {
      font = value.replace(/(\d+(?:\.\d+)?)pt/, (_, n) => `${(Number(n) * 4) / 3}px`);
    },
    measureText(text) {
      this.calls++;
      const size = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
      return (this.last = {
        width: ([...text].length * size) / 2 + this.epoch,
        actualBoundingBoxAscent: size * 0.7,
        actualBoundingBoxDescent: size * 0.2,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: ([...text].length * size) / 2,
      });
    },
    save() {
      stack.push(font);
    },
    restore() {
      font = stack.pop();
    },
  };
  return ctx;
}
const fixture = () => ({
  format: 'hwp5',
  limited: false,
  paragraphs: [
    {
      section: 0,
      paragraph: 0,
      text: 'A한B字C가D\tXX\n줄넘김ABC ABC',
      characterRanges: [
        { start: 0, end: 4, charShapeId: 0 },
        { start: 4, end: 26, charShapeId: 1 },
      ],
    },
  ],
  characterShapes: [
    { id: 0, height: 1000, bold: false, italic: false },
    { id: 1, height: 1800, bold: true, italic: true },
  ],
  characterEffects: [
    { id: 0, superscript: false, subscript: false },
    { id: 1, superscript: true, subscript: false },
  ],
  characterFontMetrics: [
    {
      id: 1,
      values: {
        ratio: [150, 100, 100, 100, 100, 100, 100],
        spacing: [20, 0, 0, 0, 0, 0, 0],
        relativeSize: [80, 100, 100, 100, 100, 100, 100],
      },
    },
  ],
});
function measure(content, ctx, store, epoch = 0, environment = []) {
  return createPreviewTextMeasure(
    ctx,
    createTextStyle(content, '16px serif', { projectionMemo: true }),
    {
      projectionMemo: true,
      stableContext: true,
      ...(store ? { rawCanvasMetrics: store.begin(epoch, environment) } : {}),
    },
  );
}

test('동일 입력의 새 프로젝션 전체 레이아웃은 같고 원시 호출만 줄어든다', () => {
  const a = context(),
    b = context(),
    store = createRendererGlyphMetrics(b),
    c = fixture();
  const before = structuredClone(c);
  const counts = [];
  for (const width of [50, 120, 300, 50]) {
    const old = layoutContent(c, width, measure(c, a));
    const next = layoutContent(c, width, measure(c, b, store));
    assert.deepEqual(next, old);
    counts.push({ baseline: a.calls, candidate: b.calls });
  }
  assert(b.calls < a.calls);
  assert.equal(counts[3].candidate, counts[1].candidate);
  assert.deepEqual(c, before);
  console.log(JSON.stringify({ kind: '원시 측정 호출', counts }));
});

test('변경된 스타일·단위·객체는 원시 키를 공유해도 레이아웃에서 재계산한다', () => {
  const ctx = context(),
    store = createRendererGlyphMetrics(ctx),
    c = fixture(),
    p = c.paragraphs[0];
  measure(c, ctx, store)('A', p, 0, 'text');
  const next = structuredClone(c);
  next.characterFontMetrics[0].values.ratio[0] = 90;
  next.characterFontMetrics[0].values.spacing[0] = 40;
  next.paragraphs[0].text += '추가';
  assert.deepEqual(
    layoutContent(next, 80, measure(next, ctx, store)),
    layoutContent(next, 80, measure(next, context())),
  );
  const font = Object.assign(() => '12px serif', {
    textHeight: () => 10,
    horizontalScale: () => 1,
  });
  const atom = { section: 0, paragraph: 0, text: '\ufffc' };
  for (const width of [10, 77]) {
    const m = createPreviewTextMeasure(ctx, font, {
      projectionMemo: true,
      stableContext: true,
      rawCanvasMetrics: store.begin(0),
      pictures: new Map([['0:0:0', { width, height: 20 }]]),
    });
    assert.deepEqual(m('\ufffc', atom, 0, 'text'), { width, height: 20 });
  }
});

test('기본·외부 가변 컨텍스트 경로는 이전 프로젝션 측정을 재사용하지 않는다', () => {
  const ctx = context(),
    c = fixture(),
    p = c.paragraphs[0];
  const first = measure(c, ctx)('A', p, 0, 'text');
  ctx.epoch = 7;
  const second = measure(c, ctx)('A', p, 0, 'text');
  assert.equal(second.width, first.width + 7);
  let used = 0;
  const ignored = {
    measureText() {
      used++;
      throw Error('호출되면 안 됨');
    },
  };
  const memo = createProjectionCanvasMetrics(ctx, undefined, { rawCanvasMetrics: ignored });
  memo.measureText('Z');
  assert.equal(used, 0);
});

test('실제 정규화된 font와 모든 context 필드를 엄격히 구분한다', () => {
  const ctx = context(),
    store = createRendererGlyphMetrics(ctx);
  let lease = store.begin(0);
  ctx.font = '12pt serif';
  lease.measureText('A');
  ctx.font = '16px serif';
  lease = store.begin(0);
  lease.measureText('A');
  assert.equal(ctx.calls, 1);
  for (const field of PROJECTION_CANVAS_CONTEXT_FIELDS) {
    ctx[field] += '-변경';
    store.begin(0).measureText('A');
  }
  assert.equal(ctx.calls, 1 + PROJECTION_CANVAS_CONTEXT_FIELDS.length);
  delete ctx.lang;
  store.begin(0).measureText('A');
  const n = ctx.calls;
  ctx.lang = '';
  store.begin(0).measureText('A');
  assert.equal(ctx.calls, n + 1);
  ctx.lang = null;
  store.begin(0).measureText('A');
  store.begin(0).measureText('A');
  assert.equal(ctx.calls, n + 3);
});

test('측정 세대·문서 환경·메서드 변경과 이전 임대는 독립이다', () => {
  const ctx = context(),
    store = createRendererGlyphMetrics(ctx),
    env = {},
    a = store.begin(0, [env]);
  a.measureText('A');
  store.begin(0, [env]).measureText('A');
  assert.equal(ctx.calls, 1);
  store.begin(1, [env]).measureText('A');
  assert.equal(ctx.calls, 2);
  store.begin(1, [{}]).measureText('A');
  assert.equal(ctx.calls, 3);
  a.measureText('A');
  assert.equal(ctx.calls, 4);
  const fn = ctx.measureText;
  ctx.measureText = function (text) {
    return fn.call(this, text);
  };
  store.begin(1, [env]).measureText('A');
  assert.equal(ctx.calls, 5);
  store.clear();
  assert.equal(store.size, 0);
  store.begin(1, [env]).measureText('A');
  assert.equal(ctx.calls, 6);
  store.close();
  assert.equal(store.size, 0);
  assert.equal(store.begin(1), undefined);
});

test('raw TextMetrics 반환값 오염은 저장된 숫자 사본으로 전파되지 않는다', () => {
  const ctx = context(),
    store = createRendererGlyphMetrics(ctx),
    lease = store.begin(0);
  const value = lease.measureText('A');
  const expected = value.width;
  ctx.last.width = 999;
  assert(Object.isFrozen(value));
  assert.throws(() => {
    value.width = 999;
  }, TypeError);
  assert.equal(lease.measureText('A').width, expected);
  assert.equal(ctx.calls, 1);
});

test('오류·비유한 값·재진입 clear·측정 중 context 변경은 캐시에 넣지 않는다', () => {
  const ctx = context(),
    original = ctx.measureText,
    store = createRendererGlyphMetrics(ctx);
  ctx.measureText = () => {
    throw Error('측정 실패');
  };
  assert.throws(() => store.begin(0).measureText('A'), /측정 실패/);
  assert.equal(store.size, 0);
  for (const value of [{ width: NaN }, { width: -1 }, { width: 1, actualBoundingBoxAscent: NaN }]) {
    ctx.measureText = () => value;
    store.begin(0).measureText('A');
    assert.equal(store.size, 0);
  }
  ctx.measureText = function (text) {
    const v = original.call(this, text);
    store.clear();
    return v;
  };
  store.begin(0).measureText('A');
  assert.equal(store.size, 0);
  ctx.measureText = function (text) {
    const v = original.call(this, text);
    this.direction = 'rtl';
    return v;
  };
  store.begin(0).measureText('A');
  assert.equal(store.size, 0);
  ctx.measureText = original;
  store.begin(0).measureText('A');
  assert.equal(store.size, 1);
});

test('4096개·추정 1MiB 예산과 LRU 퇴출·긴 입력 우회는 상한을 지킨다', () => {
  const ctx = context(),
    store = createRendererGlyphMetrics(ctx, { limit: 2 }),
    lease = store.begin(0);
  for (const t of ['A', 'B', 'A', 'C']) lease.measureText(t);
  assert.equal(store.size, 2);
  const before = ctx.calls;
  lease.measureText('A');
  assert.equal(ctx.calls, before);
  lease.measureText('B');
  assert.equal(ctx.calls, before + 1);
  const bounded = createRendererGlyphMetrics(ctx, { byteLimit: 1024 });
  const m = bounded.begin(0);
  for (let n = 0; n < 100; n++) {
    m.measureText(String(n));
    assert(bounded.estimatedBytes <= 1024);
  }
  const n = ctx.calls;
  m.measureText('장'.repeat(600000));
  m.measureText('장'.repeat(600000));
  assert.equal(ctx.calls, n + 2);
  assert.throws(() => createRendererGlyphMetrics(ctx, { limit: 4097 }), RangeError);
  assert.throws(() => createRendererGlyphMetrics(ctx, { byteLimit: 1048577 }), RangeError);
  const full = createRendererGlyphMetrics(ctx);
  const all = full.begin(0);
  for (let i = 0; i < 5000; i++) all.measureText('glyph' + i);
  assert(full.size <= 4096);
  assert(full.estimatedBytes <= 1048576);
});

function rendererFixture(t, { explicitEpoch = true } = {}) {
  const raw = context(),
    frames = [],
    fonts = new EventTarget(),
    canvas = new EventTarget();
  // 명시 호스트 epoch를 쓰는 선언형 측정 fixture입니다. 가변 closure는 epoch로 통지합니다.
  Object.defineProperty(raw, 'font', { value: '16px serif', writable: true, configurable: true });
  let hostEpoch = Object.freeze({});
  // 그림 그리기의 미사용 메서드만 대역이며 측정 필드와 함수는 실제 fixture 값입니다.
  const ctx = new Proxy(raw, { get: (o, k) => (k in o ? o[k] : () => {}) });
  Object.assign(canvas, {
    ownerDocument: { fonts, documentElement: { lang: 'ko', dir: 'ltr' } },
    getContext: () => ctx,
    style: {},
    dataset: {},
    width: 800,
    height: 600,
  });
  const viewport = {
    clientWidth: 800,
    clientHeight: 600,
    scrollTop: 0,
    scrollLeft: 0,
    addEventListener() {},
    removeEventListener() {},
  };
  const environment = {
    requestFrame: (f) => (frames.push(f), frames.length),
    cancelFrame() {},
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    setInterval: () => 1,
    clearInterval() {},
    devicePixelRatio: () => environment.dpr,
    dpr: 1,
  };
  if (explicitEpoch) environment.geometryMeasurementEpoch = () => hostEpoch;
  let output;
  const renderer = createRenderer(
    canvas,
    viewport,
    { style: {} },
    (l) => {
      output = l;
    },
    environment,
  );
  t.after(() => renderer.close());
  return {
    raw,
    canvas,
    fonts,
    environment,
    renderer,
    viewport,
    frames,
    advanceEpoch() {
      hostEpoch = Object.freeze({});
    },
    get output() {
      return output;
    },
  };
}
const simple = () => ({
  format: 'hwpx',
  limited: false,
  paragraphs: [
    { section: 0, paragraph: 0, text: '반복ABABAB 한글', editable: true, selectable: true },
  ],
});
test('실 renderer 재배치·문서 교체·clear·글꼴 이벤트·환경 변경을 연결한다', (t) => {
  const h = rendererFixture(t),
    doc = {};
  const show = () => h.renderer.show(simple(), { resourceDocument: doc, preserveScroll: true });
  show();
  const first = structuredClone(h.output);
  const n = h.raw.calls;
  show();
  assert.equal(h.raw.calls, n);
  assert.deepEqual(h.output, first);
  for (const name of ['loadingdone', 'loadingerror']) {
    const before = h.raw.calls;
    h.raw.epoch++;
    h.fonts.dispatchEvent(new Event(name));
    assert(h.raw.calls > before);
  }
  let before = h.raw.calls;
  h.environment.dpr = 2;
  show();
  assert(h.raw.calls > before);
  before = h.raw.calls;
  h.canvas.dispatchEvent(new Event('contextlost'));
  show();
  assert(h.raw.calls > before);
  before = h.raw.calls;
  h.canvas.dispatchEvent(new Event('contextrestored'));
  show();
  assert(h.raw.calls > before);
  before = h.raw.calls;
  h.canvas.width++;
  show();
  assert(h.raw.calls > before);
  before = h.raw.calls;
  h.canvas.height++;
  show();
  assert(h.raw.calls > before);
  before = h.raw.calls;
  h.viewport.clientWidth += 20;
  show();
  assert(h.raw.calls > before);
  before = h.raw.calls;
  h.viewport.clientHeight += 20;
  show();
  assert(h.raw.calls > before);
  before = h.raw.calls;
  h.advanceEpoch();
  h.raw.epoch++;
  show();
  assert(h.raw.calls > before);
  before = h.raw.calls;
  h.renderer.show(simple(), { resourceDocument: {} });
  assert(h.raw.calls > before);
  h.renderer.clear();
  before = h.raw.calls;
  show();
  assert(h.raw.calls > before);
  const replacement = new EventTarget();
  h.canvas.ownerDocument.fonts = replacement;
  show();
  before = h.raw.calls;
  h.fonts.dispatchEvent(new Event('loadingdone'));
  assert.equal(h.raw.calls, before);
  replacement.dispatchEvent(new Event('loadingdone'));
  assert(h.raw.calls > before);
  h.renderer.close();
  before = h.raw.calls;
  replacement.dispatchEvent(new Event('loadingdone'));
  h.canvas.dispatchEvent(new Event('contextrestored'));
  assert.equal(h.raw.calls, before);
});

test('실 renderer의 외부 가변 closure는 명시 epoch 없으면 프로젝션마다 다시 측정한다', (t) => {
  const h = rendererFixture(t, { explicitEpoch: false }),
    doc = {};
  h.renderer.show(simple(), { resourceDocument: doc });
  const before = h.raw.calls;
  const first = h.renderer.layout();
  h.raw.epoch = 20;
  h.renderer.show(simple(), { resourceDocument: doc });
  assert(h.raw.calls > before);
  assert.notDeepEqual(h.renderer.layout(), first);
});
test('실 renderer는 epoch 오류·descriptor 교체·measureText 교체를 재사용 허가로 바꾸지 않는다', (t) => {
  const h = rendererFixture(t),
    doc = {},
    show = () => h.renderer.show(simple(), { resourceDocument: doc });
  show();
  let before = h.raw.calls;
  const original = h.raw.measureText;
  h.raw.measureText = function (text) {
    return original.call(this, text);
  };
  show();
  assert(h.raw.calls > before);
  before = h.raw.calls;
  h.environment.geometryMeasurementEpoch = () => {
    throw Error('호스트 세대 실패');
  };
  h.raw.epoch++;
  show();
  assert(h.raw.calls > before);
  before = h.raw.calls;
  show();
  assert(h.raw.calls > before);
});

test('문서 identity 없는 renderer 호출은 같은 호스트 epoch여도 기존 수명을 유지한다', (t) => {
  const h = rendererFixture(t);
  h.renderer.show(simple());
  const before = h.raw.calls;
  h.raw.epoch++;
  h.renderer.show(simple());
  assert(h.raw.calls > before);
});
test('측정값 getter 중 clear와 close는 이전 세대에 다시 등록하지 않는다', () => {
  for (const action of ['clear', 'close']) {
    const ctx = context(),
      store = createRendererGlyphMetrics(ctx);
    ctx.measureText = () => ({
      width: 5,
      get actualBoundingBoxAscent() {
        store[action]();
        return 2;
      },
    });
    store.begin(0).measureText('A');
    assert.equal(store.size, 0);
    assert.equal(store.estimatedBytes, 0);
  }
});

test('측정 중 다른 세대 재진입은 이전 결과를 새 세대에 넣지 않는다', () => {
  const ctx = context(),
    store = createRendererGlyphMetrics(ctx),
    original = ctx.measureText;
  ctx.measureText = function (text) {
    const value = original.call(this, text);
    store.begin(1);
    return value;
  };
  store.begin(0).measureText('A');
  assert.equal(store.size, 0);
  ctx.measureText = original;
  store.begin(1).measureText('A');
  assert.equal(store.size, 1);
});

test('Canvas 정규화된 글꼴과 초기화된 측정 상태는 다른 원시 키를 사용한다', () => {
  const ctx = context(),
    store = createRendererGlyphMetrics(ctx);
  ctx.font = '12pt serif';
  const original = store.begin(0).measureText('A');
  // 같은 크기 비트맵 재설정도 글꼴·baseline 등 실제 측정 상태가 바뀌면 그 키를 구분합니다.
  ctx.font = '10px sans-serif';
  ctx.textBaseline = 'top';
  const reset = store.begin(0).measureText('A');
  assert.notEqual(reset.width, original.width);
  ctx.font = '16px serif';
  ctx.textBaseline = 'alphabetic';
  assert.equal(store.begin(0).measureText('A').width, original.width);
  assert.equal(ctx.calls, 2);
});

test('다른 Canvas 컨텍스트의 원시 포트는 재사용하지 않는다', () => {
  const a = context(),
    b = context();
  b.epoch = 30;
  const store = createRendererGlyphMetrics(a);
  const foreign = store.begin(0);
  const memo = createProjectionCanvasMetrics(b, undefined, {
    stableContext: true,
    rawCanvasMetrics: foreign,
  });
  assert.equal(memo.measureText('A').width, 38);
  assert.equal(a.calls, 0);
  assert.equal(b.calls, 1);
});
