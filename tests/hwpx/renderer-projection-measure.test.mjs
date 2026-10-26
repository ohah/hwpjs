import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewTextMeasure } from "../../web/preview/preview-text-measure.mjs";
import { createTextStyle } from "../../web/preview/text-style.mjs";
import { layoutContent } from "../../web/preview/layout.mjs";
const candidate = { createPreviewTextMeasure, createTextStyle, layoutContent };
// 같은 구현에서 기존 비캐시 경로를 oracle로 비교합니다.
const baseline = {
  createTextStyle: (content, font) => createTextStyle(content, font),
  createPreviewTextMeasure: (ctx, style, options) =>
    createPreviewTextMeasure(ctx, style, { ...options, projectionMemo: false }),
  layoutContent,
};
import {
  createProjectionRangeIndex,
  paragraphCharacterRange,
  createProjectionFontCache,
  createProjectionCanvasMetrics,
  watchProjectionFonts,
} from "../../web/preview/projection-measure-memo.mjs";
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
function context() {
  let font = "16px serif";
  const saved = [];
  const count = { measure: 0, set: 0 };
  const ctx = {
    count,
    epoch: 0,
    direction: "ltr",
    fontKerning: "auto",
    fontStretch: "normal",
    fontVariantCaps: "normal",
    letterSpacing: "0px",
    wordSpacing: "0px",
    textRendering: "auto",
    textAlign: "left",
    textBaseline: "alphabetic",
    lang: "ko",
    get font() {
      return font;
    },
    set font(value) {
      count.set++;
      font = value.replace(/(\d+(?:\.\d+)?)pt/, (_, n) => `${(Number(n) * 4) / 3}px`);
    },
    measureText(text) {
      count.measure++;
      const size = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
      return {
        width: ([...text].length * size) / 2 + this.epoch,
        actualBoundingBoxAscent: size * 0.7,
        actualBoundingBoxDescent: size * 0.2,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: ([...text].length * size) / 2,
      };
    },
    save() {
      saved.push(font);
    },
    restore() {
      font = saved.pop();
    },
  };
  return ctx;
}
function content(text = "A한B字C가D\tX\nY") {
  return {
    format: "hwp5",
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text,
        characterRanges: [
          { start: 0, end: 4, charShapeId: 0 },
          { start: 4, end: text.length, charShapeId: 1 },
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
    limited: false,
  };
}
function measure(mod, c, ctx, options = {}) {
  return mod.createPreviewTextMeasure(
    ctx,
    mod.createTextStyle(c, "16px serif", { projectionMemo: true }),
    { projectionMemo: true, ...options },
  );
}
test("같은 raw glyph와 실제 font setter는 projection 안에서만 재사용", () => {
  const ctx = context(),
    memo = createProjectionCanvasMetrics(ctx);
  memo.setFont("12pt serif");
  memo.measureText("A");
  memo.setFont("12pt serif");
  memo.measureText("A");
  assert.equal(ctx.count.set, 1);
  assert.equal(ctx.count.measure, 1);
  ctx.save();
  ctx.font = "24px sans";
  ctx.restore();
  memo.setFont("12pt serif");
  assert.equal(ctx.count.set, 2);
  ctx.font = "10px sans";
  memo.setFont("12pt serif");
  assert.equal(ctx.count.set, 4);
});
test("Canvas 방향·간격·baseline·font변경은 별도 측정", () => {
  const ctx = context(),
    memo = createProjectionCanvasMetrics(ctx);
  memo.measureText("A");
  for (const [key, value] of [
    ["direction", "rtl"],
    ["letterSpacing", "1px"],
    ["textBaseline", "top"],
    ["font", "22px serif"],
    ["fontKerning", "none"],
    ["lang", "ja"],
  ]) {
    ctx[key] = value;
    memo.measureText("A");
  }
  assert.equal(ctx.count.measure, 7);
});
test("측정 오류·잘못된 값은 캐시를 오염시키지 않음", () => {
  const ctx = context(),
    original = ctx.measureText.bind(ctx),
    memo = createProjectionCanvasMetrics(ctx);
  let fail = true;
  ctx.measureText = (t) => {
    if (fail) throw Error("의도한 측정오류");
    return original(t);
  };
  assert.throws(() => memo.measureText("A"));
  fail = false;
  memo.measureText("A");
  assert.equal(ctx.count.measure, 1);
  ctx.measureText = () => ({ width: NaN });
  memo.measureText("B");
  ctx.measureText = original;
  assert(Number.isFinite(memo.measureText("B").width));
});
test("엔트리와 추정 문자열 바이트에 상한이 있음", () => {
  const ctx = context(),
    memo = createProjectionCanvasMetrics(ctx, 2);
  for (const text of ["a", "b", "c", "c"]) memo.measureText(text);
  assert.equal(memo.size, 2);
  assert.equal(ctx.count.measure, 4);
  const limited = createProjectionCanvasMetrics(ctx);
  limited.measureText("x".repeat(600000));
  assert.equal(limited.size, 0);
  assert(limited.estimatedBytes <= 1024 * 1024);
});
test("mutable 문단의 변경된 값이 같은 identity 캐시로 가려지지 않음", () => {
  const c = content("AAAA"),
    ctx = context(),
    m = measure(candidate, c, ctx),
    p = c.paragraphs[0];
  const first = m("A", p, 0, "text");
  c.characterShapes[0].height = 2000;
  assert.notEqual(m("A", p, 0, "text").width, first.width);
  const cache = createProjectionFontCache();
  let calls = 0;
  const build = () => {
    calls++;
    return "font";
  };
  cache.get(10, "a", false, false, build);
  cache.get(10, "a", false, false, build);
  cache.get(10, "b", false, false, build);
  assert.equal(calls, 2);
});
test("서로 다른 unit/kind/문단 및 superscript·비율·spacing 결과 동일", () => {
  const c = freeze(content()),
    a = context(),
    b = context(),
    am = measure(baseline, c, a),
    bm = measure(candidate, c, b);
  for (let pass = 0; pass < 3; pass++)
    for (const p of c.paragraphs)
      for (let unit = 0; unit < p.text.length; unit++)
        for (const kind of ["text", "number-prefix"])
          assert.deepEqual(bm(p.text[unit], p, unit, kind), am(p.text[unit], p, unit, kind));
  assert(b.count.measure < a.count.measure);
});
test("새 font-ready/load/undo projection은 이전 측정값을 재사용하지 않음", () => {
  const c = freeze(content("AAAA")),
    ctx = context();
  let m = measure(candidate, c, ctx),
    first = m("A", c.paragraphs[0], 0, "text");
  ctx.epoch = 10;
  m = measure(candidate, c, ctx);
  assert.equal(m("A", c.paragraphs[0], 0, "text").width, first.width + 10);
  const changed = freeze({
    ...content("AAAA"),
    characterShapes: [{ id: 0, height: 2000, bold: false, italic: false }],
  });
  m = measure(candidate, changed, ctx);
  assert.notEqual(m("A", changed.paragraphs[0], 0, "text").width, first.width + 10);
  m = measure(candidate, c, ctx);
  assert.equal(m("A", c.paragraphs[0], 0, "text").width, first.width + 10);
});
test("문자열·탭·줄넘김·좁은 폭의 전체 layout이 동일", () => {
  for (const width of [50, 120, 300]) {
    const c = freeze(content("A한B字C가D\tXXXX\n줄넘김ABC ABC")),
      a = measure(baseline, c, context()),
      b = measure(candidate, c, context());
    assert.deepEqual(candidate.layoutContent(c, width, b), baseline.layoutContent(c, width, a));
  }
});
test("같은 글꼴의 picture/form/checkbox/chart atom을 잘못 합치지 않음", () => {
  const text = "\ufffc\ufffc\ufffc\ufffc",
    c = freeze(content(text)),
    p = c.paragraphs[0],
    options = {
      pictures: new Map([["0:0:0", { width: 12, height: 13 }]]),
      charts: new Map([["0:0:1", { width: 22, height: 23 }]]),
      checkBoxes: new Map([["0:0:2", { width: 32, height: 33, affectLineSpacing: true }]]),
      forms: new Map([["0:0:3", { width: 42, height: 43, affectLineSpacing: true }]]),
    };
  const a = measure(baseline, c, context(), options),
    b = measure(candidate, c, context(), options);
  for (let unit = 0; unit < 4; unit++) {
    const result = b(text[unit], p, unit, "text");
    assert.deepEqual(result, a(text[unit], p, unit, "text"));
    assert.equal(result.width, [12, 22, 32, 42][unit]);
  }
});

test("font-ready 재투영 listener는 닫은 뒤 정리됨", () => {
  const fonts = new EventTarget();
  let calls = 0;
  const stop = watchProjectionFonts({ ownerDocument: { fonts } }, () => calls++);
  fonts.dispatchEvent(new Event("loadingdone"));
  fonts.dispatchEvent(new Event("loadingerror"));
  assert.equal(calls, 2);
  stop();
  fonts.dispatchEvent(new Event("loadingdone"));
  assert.equal(calls, 2);
  watchProjectionFonts({}, () => {
    throw Error("호출되면 안 됨");
  })();
});

test("불변 범위 cursor는 역방향·중복 zero site·말단을 원래 이진검색과 동일 처리", () => {
  const p = freeze({
    text: "ABCD",
    characterRanges: [
      { start: 0, end: 2, charShapeId: 0 },
      { start: 2, end: 2, charShapeId: null },
      { start: 2, end: 4, charShapeId: 1 },
      { start: 4, end: 4, charShapeId: 2 },
    ],
  });
  const range = createProjectionRangeIndex();
  for (const unit of [0, 1, 2, 2, 3, 4, 0, 4, 1])
    assert.deepEqual(range(p, unit), paragraphCharacterRange(p, unit));
  const mutable = { text: "AB", characterRanges: [{ start: 0, end: 2, charShapeId: 0 }] };
  assert.equal(range(mutable, 0).charShapeId, 0);
  mutable.characterRanges[0].charShapeId = 3;
  assert.equal(range(mutable, 0).charShapeId, 3);
});

test("불변 range를 공유하는 mutable 문단의 text길이·배열교체를 구분", () => {
  const range = createProjectionRangeIndex(),
    rows = freeze([{ start: 0, end: 2, charShapeId: 1 }]),
    a = { text: "AB", characterRanges: rows },
    b = { text: "ABCD", characterRanges: rows };
  assert.equal(range(a, 2).charShapeId, 1);
  assert.equal(range(b, 2), null);
  a.characterRanges = freeze([{ start: 0, end: 2, charShapeId: 3 }]);
  assert.equal(range(a, 0).charShapeId, 3);
});

test("동기 context font 추적도 dutmal/save-restore 변경 통지 뒤 재검증", () => {
  const ctx = context(),
    m = createProjectionCanvasMetrics(ctx, undefined, { stableContext: true });
  m.setFont("12pt serif");
  m.measureText("A");
  ctx.font = "22px sans";
  m.invalidateFont();
  m.setFont("12pt serif");
  const a = m.measureText("A");
  assert.equal(a.width, 8);
  const c = content("\ufffcA");
  c.paragraphs[0].dutmal = [
    {
      unit: 0,
      mainText: "한",
      subText: "가",
      sourceAttributes: { pos_type: "TOP", alignment: "CENTER", sz_ratio: "50" },
    },
  ];
  const aMeasure = measure(baseline, freeze(c), context()),
    bMeasure = measure(candidate, c, context(), { stableContext: true });
  for (const unit of [0, 1, 0, 1])
    assert.deepEqual(
      bMeasure(c.paragraphs[0].text[unit], c.paragraphs[0], unit, "text"),
      aMeasure(c.paragraphs[0].text[unit], c.paragraphs[0], unit, "text"),
    );
});

function fixture(n, lateMutable = false) {
  const counts = { descriptors: 0 };
  const rows = Array.from({ length: n }, (_, i) => {
    const row = { start: i, end: i + 1, charShapeId: i };
    if (lateMutable && i === n - 1) return row;
    return new Proxy(Object.freeze(row), {
      getOwnPropertyDescriptor(target, key) {
        counts.descriptors++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
  });
  return { p: { text: "x".repeat(n), characterRanges: Object.freeze(rows) }, counts };
}
const measurements = [];
test("후반 mutable row의 부적격 판정은 n회 조회에도 한 번만 검증", () => {
  for (const n of [32, 64, 128]) {
    const { p, counts } = fixture(n, true),
      lookup = createProjectionRangeIndex();
    assert.equal(lookup(p, 0), paragraphCharacterRange(p, 0));
    const first = counts.descriptors;
    assert(first > 0);
    for (let i = 0; i < n; i++) assert.equal(lookup(p, i), paragraphCharacterRange(p, i));
    assert.equal(counts.descriptors, first);
    p.characterRanges[n - 1].charShapeId = 999;
    assert.equal(lookup(p, n - 1).charShapeId, 999);
    Object.freeze(p.characterRanges[n - 1]);
    assert.equal(lookup(p, n - 1).charShapeId, 999);
    assert.equal(counts.descriptors, first);
    measurements.push({ n, queries: n + 3, descriptorChecks: first });
  }
  assert.equal(measurements[1].descriptorChecks / 63, measurements[0].descriptorChecks / 31);
  assert.equal(measurements[2].descriptorChecks / 127, measurements[0].descriptorChecks / 31);
});
test("양성 또는 음성으로 상한을 채운 뒤 추가 배열의 전량 검증은 0회", () => {
  for (const negative of [false, true])
    for (const n of [32, 64, 128]) {
      const lookup = createProjectionRangeIndex(1),
        seed = fixture(2, negative);
      lookup(seed.p, 0);
      const { p, counts } = fixture(n);
      for (let i = 0; i < n; i++) assert.equal(lookup(p, i), paragraphCharacterRange(p, i));
      assert.equal(counts.descriptors, 0);
    }
});
test("기본 4096개 상한을 넘는 배열도 검증 없이 기존 검색으로 처리", () => {
  const lookup = createProjectionRangeIndex();
  for (let i = 0; i < 4096; i++) lookup(fixture(1).p, 0);
  const { p, counts } = fixture(128);
  for (let i = 0; i < 128; i++) assert.equal(lookup(p, i), paragraphCharacterRange(p, i));
  assert.equal(counts.descriptors, 0);
});
