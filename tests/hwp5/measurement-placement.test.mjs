import test from 'node:test';
import assert from 'node:assert/strict';
import { createParagraphFlowReuse } from '../../web/preview/paragraph-flow-reuse.mjs';
import {
  createMeasurementPlacementPort,
  clonePrivateMeasurement,
} from '../../web/preview/measurement-placement-private.mjs';
import { layoutContent } from '../../web/preview/layout.mjs';
const content = () => ({
  format: 'hwp5',
  paragraphs: [0, 1, 2].map((paragraph) => ({
    section: 0,
    paragraph,
    text: 'abcdef ghijkl',
    paragraphShape: { before: 0, after: 0 },
  })),
});
function setup(privateLane) {
  const cache = createParagraphFlowReuse(
      undefined,
      privateLane ? createMeasurementPlacementPort() : null,
    ),
    identity = {};
  cache.begin({ font: '16px sans-serif' }, identity);
  let calls = 0;
  const measure = (text) => {
    calls++;
    return text.length * 7;
  };
  measure.paragraphFlowReuse = cache;
  return { cache, identity, measure, calls: () => calls };
}
test('실 layout cold/warm/full 동치와 outer row 독립', () => {
  for (const width of [36, 300]) {
    const c = content(),
      a = setup(false),
      b = setup(true),
      options = { documentBody: true };
    const cold = layoutContent(c, width, b.measure, 200, options);
    const baselineCold = layoutContent(c, width, a.measure, 200, options);
    assert.deepStrictEqual(cold, baselineCold);
    const count = b.calls(),
      warm = layoutContent(c, width, b.measure, 200, options),
      raw = layoutContent(c, width, a.measure, 200, options);
    assert.deepStrictEqual(warm, raw);
    assert.equal(b.calls(), count);
    assert.equal(b.cache.stats().copiedRows, 0);
    assert.ok(a.cache.stats().copiedRows > 0);
    assert.notEqual(warm.rows[0], cold.rows[0]);
    assert.equal(Object.isFrozen(warm.rows[0]), false);
    assert.equal(Object.isFrozen(warm.rows[0].boundaries), true);
    assert.equal(Object.isFrozen(c.paragraphs[0].paragraphShape), false);
    warm.rows[0].y = 999;
    assert.notEqual(layoutContent(c, width, b.measure, 200, options).rows[0].y, 999);
  }
});
test('raw nested는 mutable/독립, private nested 변경은 거부', () => {
  const c = content(),
    a = setup(false),
    b = setup(true);
  for (const s of [a, b]) layoutContent(c, 200, s.measure);
  const raw = layoutContent(c, 200, a.measure),
    privateFlow = layoutContent(c, 200, b.measure);
  raw.rows[0].boundaries[0].x = 999;
  assert.notEqual(layoutContent(c, 200, a.measure).rows[0].boundaries[0].x, 999);
  assert.throws(() => {
    privateFlow.rows[0].boundaries[0].x = 999;
  }, TypeError);
});
test('합성 텍스트 변경/원상복귀·폭·clear·가짜 port의 raw 경로', () => {
  const c = content(),
    b = setup(true);
  const initial = layoutContent(c, 200, b.measure);
  c.paragraphs[0].text += 'X';
  const edited = layoutContent(c, 200, b.measure);
  assert.notDeepStrictEqual(edited, initial);
  c.paragraphs[0].text = c.paragraphs[0].text.slice(0, -1);
  assert.deepStrictEqual(layoutContent(c, 200, b.measure), initial);
  const full = (text) => text.length * 7;
  assert.deepStrictEqual(layoutContent(c, 40, b.measure), layoutContent(c, 40, full));
  b.cache.clear();
  assert.equal(b.cache.stats().entries, 0);
  const fake = createParagraphFlowReuse(undefined, {});
  fake.begin({}, {});
  const m = (text) => text.length * 7;
  m.paragraphFlowReuse = fake;
  layoutContent(c, 200, m);
  assert.equal(Object.isFrozen(layoutContent(c, 200, m).rows[0].boundaries), false);
});
test('후천 clone identity wrapper는 private cache decline이며 원본 freeze0', () => {
  const c = content(),
    b = setup(true),
    desc = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone');
  let flow,
    calls = 0;
  try {
    Object.defineProperty(globalThis, 'structuredClone', {
      ...desc,
      value(value) {
        calls++;
        return value;
      },
    });
    flow = layoutContent(c, 200, b.measure);
  } finally {
    Object.defineProperty(globalThis, 'structuredClone', desc);
  }
  assert.equal(calls, 0);
  assert.equal(b.cache.stats().entries, 0);
  assert.equal(Object.isFrozen(c.paragraphs[0].paragraphShape), false);
  assert.equal(Object.isFrozen(flow.rows[0].boundaries), false);
  // 정상 host로 복귀해도 거부한 계산은 이전 cache entry로 게시되지 않는다.
  assert.equal(Object.isFrozen(layoutContent(c, 200, b.measure).rows[0].boundaries), false);
});
test('freeze/ownKeys 후천 훅은 원본을 관측하되 private clone은 노출하지 않음', () => {
  const point = { unit: 0, x: 8, marker: 'owned-point' },
    shape = { marker: 'owned-shape', before: 0 };
  const p = { section: 0, paragraph: 0, text: 'a' },
    c = { format: 'hwp5', paragraphs: [p] };
  const rows = [
    {
      section: 0,
      paragraph: 0,
      text: 'a',
      y: 0,
      height: 10,
      boundaries: [point],
      paragraphShape: shape,
    },
  ];
  const b = setup(true),
    scope = b.cache.scope(c, 200, {}),
    miss = scope.lookup(p, 10, [], true);
  const oldFreeze = Object.freeze,
    oldKeys = Reflect.ownKeys;
  let freezeLeaks = 0,
    cloneLeaks = 0,
    sourceTouches = 0;
  try {
    Object.freeze = function (value) {
      freezeLeaks++;
      return value;
    };
    Reflect.ownKeys = function (value) {
      if (value === point || value === shape) sourceTouches++;
      else if (value?.marker === 'owned-point' || value?.marker === 'owned-shape') cloneLeaks++;
      return oldKeys(value);
    };
    miss.store(rows, 10);
  } finally {
    Object.freeze = oldFreeze;
    Reflect.ownKeys = oldKeys;
  }
  assert.ok(sourceTouches > 0);
  assert.equal(cloneLeaks, 0);
  assert.equal(freezeLeaks, 0);
  assert.equal(Object.isFrozen(point), false);
  assert.equal(Object.isFrozen(shape), false);
  const hit = scope.lookup(p, 10, [], true);
  assert.equal(hit.value.rows[0].boundaries[0].x, 8);
  assert.equal(Object.isFrozen(hit.value.rows[0].boundaries[0]), true);
});

// 표 캐시와 무관한 private clone의 관측 가능한 graph 계약입니다.
test('null-prototype opt-in은 primitive와 기본 clone 동작을 바꾸지 않는다', () => {
  for (const value of [null, undefined, true, false, 0, -0, 123, '본문', 12n]) {
    assert.deepStrictEqual(clonePrivateMeasurement(value).value, value);
    assert.deepStrictEqual(
      clonePrivateMeasurement(value, { preserveNullPrototype: true }).value,
      value,
    );
  }
  const child = Object.assign(Object.create(null), { value: 3 });
  const source = Object.assign(Object.create(null), { child });
  const normal = clonePrivateMeasurement(source).value;
  assert.equal(Object.getPrototypeOf(normal), Object.prototype);
  assert.equal(Object.getPrototypeOf(normal.child), Object.prototype);
  const preserved = clonePrivateMeasurement(source, { preserveNullPrototype: true }).value;
  assert.deepStrictEqual(preserved, source);
  assert.equal(Object.getPrototypeOf(preserved), null);
  assert.equal(Object.getPrototypeOf(preserved.child), null);
  assert.notEqual(preserved.child, child);
  assert.ok(Object.isFrozen(preserved.child));
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(child), false);
});
test('null-prototype opt-in은 배열 alias와 cycle을 보존하고 원본과 분리한다', () => {
  const node = Object.assign(Object.create(null), { value: -0, optional: undefined });
  const source = { items: [node, node], child: node };
  source.self = source;
  node.parent = source;
  const value = clonePrivateMeasurement(source, { preserveNullPrototype: true }).value;
  assert.deepStrictEqual(value, source);
  assert.equal(value.self, value);
  assert.equal(value.items[0], value.items[1]);
  assert.equal(value.items[0], value.child);
  assert.equal(value.child.parent, value);
  assert.equal(Object.getPrototypeOf(value.child), null);
  assert.equal(Object.getPrototypeOf(value.items), Array.prototype);
  assert.ok(Object.isFrozen(value.items));
  assert.notEqual(value.child, node);
  node.value = 7;
  assert.ok(Object.is(value.child.value, -0));
});
test('null-prototype 문단의 private cold/warm은 fresh uncached 전체 결과와 strict 동치다', () => {
  for (const width of [36, 200]) {
    const c = content();
    for (const p of c.paragraphs)
      p.paragraphShape = Object.assign(Object.create(null), {
        alignment: 0,
        modernSpacing: Object.assign(Object.create(null), { before: 0, after: 0 }),
      });
    const s = setup(true);
    for (const text of ['abcdef ghijkl', '다른 문단 text', 'abcdef ghijkl']) {
      c.paragraphs[0].text = text;
      const fresh = layoutContent(c, width, (value) => value.length * 7, 200, {
        documentBody: true,
      });
      const cold = layoutContent(c, width, s.measure, 200, { documentBody: true });
      const calls = s.calls();
      const warm = layoutContent(c, width, s.measure, 200, { documentBody: true });
      assert.deepStrictEqual(cold, fresh);
      assert.deepStrictEqual(warm, fresh);
      assert.equal(s.calls(), calls);
      assert.notEqual(cold.rows[0], warm.rows[0]);
      for (const row of warm.rows) {
        assert.equal(Object.getPrototypeOf(row.paragraphShape), null);
        assert.equal(Object.getPrototypeOf(row.paragraphShape.modernSpacing), null);
      }
      assert.equal(Object.isFrozen(c.paragraphs[0].paragraphShape), false);
    }
    assert.ok(s.cache.stats().hits > 0);
  }
});
