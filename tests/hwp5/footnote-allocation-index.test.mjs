import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootnoteAllocationIndex } from '../../web/preview/footnote-allocation-index.mjs';
import { paginateFootnoteContinuationUnits } from '../../web/preview/footnote-continuation-engine.mjs';
import { plainFootnoteUnitsAdapter } from '../../web/preview/plain-footnote-units-adapter.mjs';

// 제품 helper 없이 가산 순서까지 독립적으로 정의한 oracle입니다.
const reduceOracle = (fragments, overhead, policy) =>
  fragments.length
    ? overhead +
      fragments.reduce((sum, fragment) => sum + fragment.height, 0) +
      policy.betweenNotes * (fragments.length - 1)
    : 0;
const bits = (value) => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  return view.getBigUint64(0);
};

test('512개 prefix와 극단값의 Float64 비트가 독립 reduce와 같다', () => {
  let seed = 41;
  const random = Array.from({ length: 512 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 0x100000000) * 10 ** ((seed % 12) - 6);
  });
  for (const heights of [
    random,
    [0.1, 0.2, 0.3, Number.MIN_VALUE],
    [1e16, 1, 1, 1e-16],
    [Number.MAX_VALUE, Number.MAX_VALUE, 1],
    [-0, 0, 1],
    [1, Number.EPSILON, Number.EPSILON / 2],
  ]) {
    const policy = { betweenNotes: 0.1 },
      fragments = [];
    const index = createFootnoteAllocationIndex(0.2, policy, true);
    for (const height of heights) {
      const fragment = { height };
      fragments.push(fragment);
      index.append(0, fragment);
      assert.equal(bits(index.reserved(0)), bits(reduceOracle(fragments, 0.2, policy)));
      assert.deepEqual(index.fragments(0), fragments);
    }
  }
});

test('overhead와 gap을 prefix 안으로 이동하는 반례를 구분한다', () => {
  const policy = { betweenNotes: 1 },
    fragments = [{ height: 1 }, { height: 1 }];
  const index = createFootnoteAllocationIndex(1e16, policy, true);
  for (const fragment of fragments) index.append(0, fragment);
  let wrong = 1e16;
  wrong += 1;
  wrong += 1;
  wrong += 1;
  assert.notEqual(bits(wrong), bits(reduceOracle(fragments, 1e16, policy)));
  assert.equal(bits(index.reserved(0)), bits(reduceOracle(fragments, 1e16, policy)));
});

test('페이지별 합계·fragment 순서·key 삽입 순서는 서로 분리된다', () => {
  const policy = { betweenNotes: 0.25 },
    index = createFootnoteAllocationIndex(2, policy, true);
  const pages = new Map();
  for (const [page, height] of [
    [7, 0.1],
    [2, 4],
    [7, 0.2],
    [0, 3],
    [2, 5],
  ]) {
    const fragment = { height };
    if (!pages.has(page)) pages.set(page, []);
    pages.get(page).push(fragment);
    index.append(page, fragment);
    for (const [ordinal, fragments] of pages) {
      assert.equal(bits(index.reserved(ordinal)), bits(reduceOracle(fragments, 2, policy)));
      assert.deepEqual(index.fragments(ordinal), fragments);
      assert.equal(index.fragments(ordinal)[0], fragments[0]);
    }
  }
  assert.deepEqual([...index.keys()], [7, 2, 0]);
});

test('빈 페이지 조회는 정책 getter를 읽거나 페이지를 생성하지 않는다', () => {
  const index = createFootnoteAllocationIndex(
    1,
    {
      get betweenNotes() {
        throw Error('읽기 금지');
      },
    },
    true,
  );
  assert.equal(index.reserved(99), 0);
  assert.deepEqual(index.fragments(99), []);
  index.fragments(99).push({ height: 100 });
  assert.deepEqual(index.fragments(99), []);
  assert.deepEqual([...index.keys()], []);
});

test('owned fragment 높이는 append당 정확히 한 번만 읽는다', () => {
  let reads = 0;
  const index = createFootnoteAllocationIndex(0.5, { betweenNotes: 0.25 }, true);
  for (let i = 1; i <= 64; i++) {
    index.append(i % 2, {
      get height() {
        reads++;
        return i;
      },
    });
    assert.equal(reads, i);
    for (let j = 0; j < 8; j++) {
      index.reserved(0);
      index.reserved(1);
    }
    assert.equal(reads, i);
  }
  assert.equal(index.reserved(0), 1056 + 0.5 + 0.25 * 31);
  assert.equal(index.reserved(1), 1024 + 0.5 + 0.25 * 31);
});

test('간격 getter는 owned 합계에서도 조회 시점마다 읽는다', () => {
  let reads = 0;
  const index = createFootnoteAllocationIndex(
    1,
    {
      get betweenNotes() {
        return ++reads * 0.1;
      },
    },
    true,
  );
  index.append(2, { height: 1 });
  index.append(2, { height: 2 });
  assert.equal(reads, 0);
  assert.equal(index.reserved(2), 4.1);
  assert.equal(index.reserved(2), 4.2);
  assert.equal(reads, 2);
});

test('custom 기본 경로는 append 시 높이를 읽지 않고 나중 변이를 반영한다', () => {
  let value = 2,
    reads = 0;
  const fragment = {
    get height() {
      reads++;
      return value;
    },
  };
  const index = createFootnoteAllocationIndex(1, { betweenNotes: 0 });
  index.append(0, fragment);
  assert.equal(reads, 0);
  assert.equal(index.reserved(0), 3);
  value = 4;
  assert.equal(index.reserved(0), 5);
  assert.equal(reads, 2);
});

test('custom fallback 높이와 간격 getter의 관측 순서는 독립 reduce와 같다', () => {
  function run(useIndex) {
    const events = [];
    const policy = {
      get betweenNotes() {
        events.push('gap');
        return 0.5;
      },
    };
    const fragments = [1, 2, 3].map((n) => ({
      get height() {
        events.push(n);
        return n;
      },
    }));
    const index = createFootnoteAllocationIndex(1, policy);
    for (const fragment of fragments) index.append(0, fragment);
    assert.deepEqual(events, []);
    const values = [0, 1].map(() =>
      useIndex ? index.reserved(0) : reduceOracle(fragments, 1, policy),
    );
    return { events, values };
  }
  assert.deepEqual(run(true), run(false));
  assert.deepEqual(run(true).events, [1, 2, 3, 'gap', 1, 2, 3, 'gap']);
});

test('custom getter 예외는 동일 객체로 같은 순서와 조회 시점에 전파된다', () => {
  for (const failAt of ['height', 'gap']) {
    const reason = Error(failAt);
    function run(useIndex) {
      const events = [];
      const fragments = [1, 2, 3].map((n) => ({
        get height() {
          events.push(n);
          if (failAt === 'height' && n === 2) throw reason;
          return n;
        },
      }));
      const policy = {
        get betweenNotes() {
          events.push('gap');
          throw reason;
        },
      };
      const index = createFootnoteAllocationIndex(1, policy);
      assert.doesNotThrow(() => fragments.forEach((f) => index.append(0, f)));
      assert.deepEqual(events, []);
      assert.throws(
        () => (useIndex ? index.reserved(0) : reduceOracle(fragments, 1, policy)),
        (e) => e === reason,
      );
      return events;
    }
    assert.deepEqual(run(true), run(false));
    assert.deepEqual(run(true), failAt === 'height' ? [1, 2] : [1, 2, 3, 'gap']);
  }
});

const setting = {
  section_ordinal: 0,
  width: 7500,
  height: 7500,
  orientation: 'widely',
  gutter_type: 'left_only',
  duplicate_margins: 0,
  margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
};
const policy = {
  state: 'selected',
  kind: 'footnote',
  section: 0,
  aboveLine: 1,
  belowLine: 2,
  betweenNotes: 3,
  beneathText: false,
};

function sample(n = 8, rowCount = 32, heights = [1]) {
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    kind: 'text',
    section: 0,
    paragraph: i,
    startUnit: 0,
    endUnit: i === 0 ? n + 1 : 1,
    x: 0,
    y: i,
    width: n + 1,
    height: 1,
    text: i === 0 ? 'x'.repeat(n + 1) : 'x',
  }));
  const flows = rows.map((row) => ({
    section: 0,
    paragraph: row.paragraph,
    top_level: true,
    column_break: null,
    page_break: null,
  }));
  const notes = Array.from({ length: n }, (_, i) => {
    let y = 0;
    const noteRows = heights.map((height, unit) => {
      const row = {
        kind: 'text',
        section: 0,
        paragraph: 100 + i,
        startUnit: unit,
        endUnit: unit + 1,
        x: 0,
        y,
        width: 1,
        height,
        text: 'n',
      };
      y += height;
      return row;
    });
    return {
      kind: 'footnote',
      section: 0,
      noteNode: 40 + i,
      hostParagraph: 0,
      anchorUnit: i,
      width: 100,
      height: y,
      boxes: [],
      rows: noteRows,
    };
  });
  return [
    rows,
    { ...setting, height: 75000000 },
    flows,
    notes,
    { ...policy, aboveLine: 0, belowLine: 0, betweenNotes: 0 },
    0,
    { maxRows: 20000, maxPages: 2000, maxPasses: 4000 },
    true,
  ];
}
function snapshot(result) {
  if (result.state !== 'ready') return result;
  const { notesFor, ...data } = result;
  return { ...data, allocations: result.page.pages.map((page) => notesFor([], page.ordinal, 0)) };
}

// 같은 현재 engine과 동일 validator/units/fragment를 사용합니다.
// 객체 identity만 달라 custom fallback을 선택하며 엔진 복제나 브랜드 API는 없습니다.
const customAdapter = {
  validate: (...args) => plainFootnoteUnitsAdapter.validate(...args),
  units: (...args) => plainFootnoteUnitsAdapter.units(...args),
  fragment: (...args) => plainFootnoteUnitsAdapter.fragment(...args),
};
function compareCurrent(args, state) {
  const cached = snapshot(paginateFootnoteContinuationUnits(...structuredClone(args)));
  const fallback = snapshot(
    paginateFootnoteContinuationUnits(...structuredClone(args), customAdapter),
  );
  assert.equal(cached.state, state, cached.error);
  assert.deepEqual(cached, fallback);
  assert.equal(JSON.stringify(cached), JSON.stringify(fallback));
  return cached;
}
test('현재 engine plain 내부 캐시와 동일 계약 custom fallback의 행·쪽·fragment가 같다', () => {
  for (const n of [1, 4, 16])
    for (const rows of [1, 17, 64]) compareCurrent(sample(n, rows), 'ready');
});
test('현재 engine 소수 높이·실제 페이지 분할에서도 cache와 fallback이 같다', () => {
  let split = false;
  for (const heights of [
    [0.1, 0.2, 0.3],
    [11.1, 22.2, 33.3],
    [1e-4, 0.003, 9.7],
  ]) {
    const args = sample(3, 30, heights);
    args[1].height = 7500;
    const result = compareCurrent(args, 'ready');
    if (result.page.pages.length > 1) split = true;
  }
  assert(split, '실제 페이지 분할 양성 대조가 필요합니다');
});
test('현재 engine bounds·owner·reference·행·간격 오류 거부도 fallback과 같다', () => {
  const changes = [
    (a) => {
      a[6].maxRows = 0;
    },
    (a) => {
      a[6].maxPasses = 0;
    },
    (a) => {
      a[3][1].noteNode = a[3][0].noteNode;
    },
    (a) => {
      a[3][0].anchorUnit = 999;
    },
    (a) => {
      a[3][0].rows[0].height = -1;
    },
    (a) => {
      a[3][0].width = 101;
    },
    (a) => {
      a[2][0].column_changes = false;
    },
    (a) => {
      a[4].betweenNotes = -1;
    },
    (a) => {
      a[3][0].rows[0].transform = {};
    },
  ];
  for (const change of changes) {
    const args = sample(2, 4);
    change(args);
    compareCurrent(args, 'unavailable');
  }
});
