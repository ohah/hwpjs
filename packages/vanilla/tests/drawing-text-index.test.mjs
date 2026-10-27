import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectionPairIndex } from '../../../web/preview/projection-pair-index.mjs';
import { projectHwp5DrawingText as candidate } from '../../../web/preview/hwp5-drawing-text-projection.mjs';
import { projectHwp5DrawingText as baseline } from './helpers/drawing-text-projector-oracle.mjs';
const freeze = (x) => {
  if (x && typeof x === 'object') {
    for (const v of Object.values(x)) freeze(v);
    Object.freeze(x);
  }
  return x;
};
function fixture(n) {
  const paragraphs = [],
    bodies = [],
    roots = [],
    flows = [];
  for (let i = 0; i < n; i++) {
    const control = 1 + i * 3,
      owner = control + 1,
      list = control + 2;
    paragraphs.push({ section: 0, paragraph: i, text: '본문', label: '' });
    roots.push({ section: 0, controlNode: control, componentNode: owner });
    flows.push({
      section: 0,
      paragraph: i,
      host: 'drawing',
      parent_node: owner,
      list_node: list,
      top_level: false,
    });
    bodies.push({
      section: 0,
      kind: 'body',
      ownerNode: owner,
      controlNode: control,
      listNode: list,
      paragraphs: [i],
      source: {
        kind: 'body',
        control_node: control,
        owner_node: owner,
        list_node: list,
        paragraph_count: 1,
        attributes: 0,
        extra_bytes: 12,
        unknown: null,
        extra_nonzero: false,
        margins: [0, 0, 0, 0],
        last_width: 0,
        body_extra_bytes: 0,
        caption: null,
      },
    });
  }
  return {
    paragraphs,
    hwp5DrawingBodies: bodies,
    hwp5Drawings: roots,
    currentParagraphFlows: flows,
  };
}
function filterVisits(fn) {
  const original = Array.prototype.filter;
  let visits = 0;
  Array.prototype.filter = function (callback, thisArg) {
    return Reflect.apply(original, this, [
      (value, index, array) => {
        visits++;
        return Reflect.apply(callback, thisArg, [value, index, array]);
      },
    ]);
  };
  try {
    return { value: fn(), visits };
  } finally {
    Array.prototype.filter = original;
  }
}
for (const n of [32, 64, 128])
  test(`drawing ${n}개는 전후동치·index 두배열 한 번·이차 filter 제거`, () => {
    const c = freeze(fixture(n)),
      a = filterVisits(() => baseline(c)),
      b = filterVisits(() => candidate(c));
    assert.equal(a.value.state, 'projected');
    assert.deepEqual(b.value, a.value);
    assert.equal(a.visits, 2 * n * n);
    assert.equal(b.visits, 0);
    const roots = createProjectionPairIndex(c.hwp5Drawings, 'section', 'controlNode'),
      flows = createProjectionPairIndex(c.currentParagraphFlows, 'section', 'paragraph');
    for (let i = 0; i < n; i++) {
      assert.equal(roots.find(0, 1 + i * 3).count, 1);
      assert.equal(flows.find(0, i).count, 1);
    }
    assert.equal(roots.stats().entryVisits, n);
    assert.equal(flows.stats().entryVisits, n);
    assert.equal(roots.stats().fallbackEntryVisits + flows.stats().fallbackEntryVisits, 0);
    console.log(
      JSON.stringify({
        n,
        baselineFilterVisits: a.visits,
        candidateFilterVisits: b.visits,
        rootIndexVisits: roots.stats().entryVisits,
        flowIndexVisits: flows.stats().entryVisits,
      }),
    );
  });
for (const [name, mutate] of [
  ['root중복', (c) => c.hwp5Drawings.push({ ...c.hwp5Drawings[0] })],
  ['flow중복', (c) => c.currentParagraphFlows.push({ ...c.currentParagraphFlows[0] })],
  ['root누락', (c) => c.hwp5Drawings.shift()],
  ['flow누락', (c) => c.currentParagraphFlows.shift()],
  ['잘못된owner', (c) => (c.hwp5DrawingBodies[0].ownerNode = 999)],
  ['잘못된paragraph', (c) => (c.hwp5DrawingBodies[0].paragraphs = [NaN])],
])
  test(name + '의 기존 오류·선행검사 보존', () => {
    const c = fixture(2);
    mutate(c);
    freeze(c);
    assert.deepEqual(candidate(c), baseline(c));
    assert.equal(candidate(c).state, 'unavailable');
  });
test('pair index는 중복 개수·첫항목·strict key 의미 보존', () => {
  const a = freeze({ section: 0, paragraph: 1 }),
    b = freeze({ section: 0, paragraph: 1 }),
    nan = freeze({ section: NaN, paragraph: 1 }),
    rows = Object.freeze([a, b, nan]),
    index = createProjectionPairIndex(rows, 'section', 'paragraph');
  assert.equal(index.find(0, 1).count, 2);
  assert.equal(index.find(0, 1).first, a);
  assert.equal(index.find(NaN, 1).count, 0);
});

test('plain mutable 지역 색인은 snapshot이며 다음 투영에서 새 값을 반영', () => {
  const a = { section: 0, paragraph: 1 },
    rows = [a],
    index = createProjectionPairIndex(rows, 'section', 'paragraph');
  assert.equal(index.find(0, 1).count, 1);
  assert.equal(index.stats().indexed, true);
  a.paragraph = 2;
  assert.equal(index.find(0, 1).first.paragraph, 1);
  assert.equal(createProjectionPairIndex(rows, 'section', 'paragraph').find(0, 2).count, 1);
});
test('accessor는 실행 없이 index를 거부하고 원 탐색에서만 읽음', () => {
  let reads = 0;
  const getter = Object.freeze({
    get section() {
      reads++;
      return 0;
    },
    paragraph: 1,
  });
  const index = createProjectionPairIndex(Object.freeze([getter]), 'section', 'paragraph');
  assert.equal(index.find(0, 1).count, 1);
  assert.equal(reads, 1);
  assert.equal(index.stats().indexed, false);
});
for (const n of [32, 64, 128])
  test(`plain mutable drawing ${n}개도 지역 index로 선형 조회`, () => {
    const c = fixture(n),
      a = filterVisits(() => baseline(c)),
      b = filterVisits(() => candidate(c));
    assert.equal(a.value.state, 'projected');
    assert.deepEqual(b.value, a.value);
    assert.equal(a.visits, 2 * n * n);
    assert.equal(b.visits, 0);
    const roots = createProjectionPairIndex(c.hwp5Drawings, 'section', 'controlNode'),
      flows = createProjectionPairIndex(c.currentParagraphFlows, 'section', 'paragraph');
    for (let i = 0; i < n; i++) {
      assert.equal(roots.find(0, 1 + i * 3).count, 1);
      assert.equal(flows.find(0, i).count, 1);
    }
    assert.equal(roots.stats().entryVisits, n);
    assert.equal(flows.stats().entryVisits, n);
    console.log(
      JSON.stringify({
        scope: 'plain mutable',
        n,
        baselineFilterVisits: a.visits,
        candidateFilterVisits: b.visits,
        rootIndexVisits: roots.stats().entryVisits,
        flowIndexVisits: flows.stats().entryVisits,
      }),
    );
  });
test('투영 사이 mutable flow 변경은 새 조회와 기존 오류로 반영', () => {
  const c = fixture(2);
  assert.equal(candidate(c).state, 'projected');
  c.currentParagraphFlows[0].host = 'body';
  assert.deepEqual(candidate(c), baseline(c));
  assert.equal(candidate(c).state, 'unavailable');
});
test('body accessor는 기존 읽기 횟수·결과를 유지하는 fallback', () => {
  const c = fixture(2);
  let reads = 0;
  Object.defineProperty(c.hwp5DrawingBodies[0], 'section', {
    get() {
      reads++;
      return 0;
    },
    enumerable: true,
  });
  reads = 0;
  const a = baseline(c),
    before = reads;
  reads = 0;
  const b = candidate(c);
  assert.deepEqual(b, a);
  assert.equal(reads, before);
});
test('불안정 descriptor Proxy는 기존 처리로 돌아가며 권위를 만들지 않음', () => {
  const c = fixture(2);
  c.hwp5DrawingBodies[0] = new Proxy(c.hwp5DrawingBodies[0], {
    ownKeys() {
      throw Error('불안정 descriptor');
    },
  });
  const a = filterVisits(() => baseline(c)),
    b = filterVisits(() => candidate(c));
  assert.deepEqual(b.value, a.value);
  assert.equal(b.visits, a.visits);
});

test('부모 custom iterator 반례는 filter의 숫자 index 순회를 그대로 보존', () => {
  const original = Object.freeze({ section: 0, paragraph: 1 }),
    rows = [original];
  Object.defineProperty(rows, Symbol.iterator, {
    value: function* () {
      yield Object.freeze({ section: 0, paragraph: 2 });
    },
  });
  Object.freeze(rows);
  const expected = rows.filter((row) => row.section === 0 && row.paragraph === 1),
    index = createProjectionPairIndex(rows, 'section', 'paragraph');
  assert.equal(expected.length, 1);
  assert.equal(index.find(0, 1).count, 1);
  assert.equal(index.find(0, 1).first, original);
  assert.equal(index.find(0, 2).count, 0);
});
for (const optional of [null, undefined])
  test(`optional 배열 ${String(optional)}은 기존 nullish 동작 유지`, () => {
    const empty = createProjectionPairIndex(optional, 'section', 'paragraph');
    assert.equal(empty.find(0, 0).count, 0);
    const roots = fixture(1);
    roots.hwp5Drawings = optional;
    assert.deepEqual(candidate(roots), baseline(roots));
    assert.equal(candidate(roots).error, 'MissingHwp5DrawingTextRoot');
    const flows = fixture(1);
    flows.currentParagraphFlows = optional;
    assert.deepEqual(candidate(flows), baseline(flows));
    assert.equal(candidate(flows).error, 'Hwp5DrawingTextMemberMismatch');
  });
test('descriptor 관측이 실패하는 Proxy 행은 원 filter 조회로 돌아감', () => {
  const row = new Proxy(
      { section: 0, paragraph: 1 },
      {
        ownKeys() {
          throw Error('관측 불안정');
        },
      },
    ),
    rows = [row],
    index = createProjectionPairIndex(rows, 'section', 'paragraph');
  assert.equal(rows.filter((p) => p.section === 0 && p.paragraph === 1).length, 1);
  assert.equal(index.find(0, 1).count, 1);
  assert.equal(index.stats().indexed, false);
});
