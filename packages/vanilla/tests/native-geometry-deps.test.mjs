import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeGeometryDeps } from '../../../web/preview/native-geometry-deps.mjs';

const token = () => Object.freeze({});
const content = (text = '원문') =>
  Object.freeze({
    format: 'hwp5',
    limited: false,
    paragraphs: Object.freeze([
      Object.freeze({ section: 0, paragraph: 0, text }),
      Object.freeze({ section: 0, paragraph: 1, text: '다른 문단' }),
    ]),
  });
function harness() {
  // 소비자 단위용 등록표입니다. Native provenance 실행 증거가 아닙니다.
  const registry = new WeakMap(),
    scope = token(),
    resourceLease = token();
  const deps = createNativeGeometryDeps({
    readEvidence: (e, c) => {
      const value = registry.get(e);
      return value?.content === c ? value.metadata : undefined;
    },
  });
  const host = {
    width: 800,
    scale: 1,
    dpr: 1,
    fontEpoch: 0,
    decodedResourceEpoch: 0,
    fontKey: '본문',
    textBoundaryIdentity: token(),
    measurementPolicy: token(),
  };
  function issue(c, patch = {}) {
    const evidence = token();
    registry.set(evidence, {
      content: c,
      metadata: Object.freeze({
        scope,
        resourceLease,
        kind: 'full-baseline',
        nativeEpoch: '1',
        nativeRevision: 0,
        owner: null,
        ...patch,
      }),
    });
    return evidence;
  }
  const delta = {
    kind: 'exclusive-text',
    beforeEpoch: '1',
    nativeEpoch: '2',
    beforeRevision: 0,
    nativeRevision: 1,
    owner: Object.freeze({ section: 0, paragraph: 0 }),
    ownerTextRunGeneration: 1,
  };
  return { deps, host, issue, delta };
}

test('resolver 누락은 정규 Native 권한으로 간주하지 않음', () => {
  assert.throws(() => createNativeGeometryDeps(), /ResolverRequired/);
});
test('등록 없는 DTO boolean·clone·content 치환은 fallback', () => {
  const { deps, host, issue } = harness(),
    c = content();
  assert.equal(deps.prepare(c, { exclusive: true }, host), null);
  const e = issue(c);
  assert.equal(deps.prepare(c, { ...e }, host), null);
  assert.equal(deps.prepare(content(), e, host), null);
  assert(deps.prepare(c, e, host));
});
test('연속 Native delta는 자원 환경 유지·변경 owner만 stamp 변경', () => {
  const { deps, host, issue, delta } = harness(),
    a = content(),
    b = content('수정');
  const first = deps.prepare(a, issue(a), host),
    oldTarget = first.stamp(a.paragraphs[0]);
  const oldOther = first.stamp(a.paragraphs[1]);
  const next = deps.prepare(b, issue(b, delta), host);
  assert.equal(next.key, first.key);
  assert.notEqual(next.stamp(b.paragraphs[0]), oldTarget);
  assert.equal(next.stamp(b.paragraphs[1]), oldOther);
  assert.equal(first.stamp(a.paragraphs[0]), null);
});
test('선택 successor 같은 증거는 환경/stamp를 불필요 변경하지 않음', () => {
  const { deps, host, issue } = harness(),
    c = content(),
    e = issue(c);
  const a = deps.prepare(c, e, host),
    b = deps.prepare(c, e, host);
  assert.equal(a.key, b.key);
  assert.equal(a.stamp(c.paragraphs[0]), b.stamp(c.paragraphs[0]));
});
test('full 서식 새 자원·undo 기준은 이전 key 폐기', () => {
  const { deps, host, issue } = harness(),
    c = content();
  const a = deps.prepare(c, issue(c), host);
  const b = deps.prepare(
    c,
    issue(c, { resourceLease: token(), nativeEpoch: '2', nativeRevision: 1 }),
    host,
  );
  assert.notEqual(a.key, b.key);
});
test('누락 ACK/gap은 현재 whole content로 새 기하 기준을 만듦', () => {
  const { deps, host, issue, delta } = harness(),
    a = content(),
    b = content('새 본문');
  const first = deps.prepare(a, issue(a), host);
  const next = deps.prepare(
    b,
    issue(b, { ...delta, beforeEpoch: '5', nativeEpoch: '6', nativeRevision: 5 }),
    host,
  );
  assert.notEqual(first.key, next.key);
  assert(next.stamp(b.paragraphs[0]));
});
test('호스트 의존성 값·descriptor·분절/측정 token 변경은 miss', () => {
  const { deps, host, issue } = harness(),
    c = content(),
    e = issue(c);
  let before = deps.prepare(c, e, host).key;
  for (const update of [
    { width: 900 },
    { scale: 1.25 },
    { dpr: 2 },
    { fontEpoch: 1 },
    { decodedResourceEpoch: 1 },
    { fontKey: '새 글꼴' },
    { textBoundaryIdentity: token() },
    { measurementPolicy: token() },
  ]) {
    Object.assign(host, update);
    const after = deps.prepare(c, e, host).key;
    assert.notEqual(before, after);
    before = after;
  }
  Object.defineProperty(host, 'width', { value: host.width, writable: false });
  assert.notEqual(deps.prepare(c, e, host).key, before);
});
test('host getter 실행0/unknown mutable policy·null boundary fallback', () => {
  const { deps, host, issue } = harness(),
    c = content(),
    e = issue(c);
  let calls = 0;
  Object.defineProperty(host, 'width', {
    get() {
      calls++;
      return 800;
    },
  });
  assert.equal(deps.prepare(c, e, host), null);
  assert.equal(calls, 0);
  const other = harness();
  assert.equal(
    other.deps.prepare(c, other.issue(c), {
      ...other.host,
      measurementPolicy: Object.freeze({ child: {} }),
    }),
    null,
  );
  assert.equal(
    other.deps.prepare(c, other.issue(c), { ...other.host, textBoundaryIdentity: null }),
    null,
  );
});
test('등록 content의 행 복제·파생 draft는 원본 Native stamp로 위장하지 않음', () => {
  const { deps, host, issue } = harness(),
    c = content();
  const session = deps.prepare(c, issue(c), host);
  assert.equal(session.stamp({ ...c.paragraphs[0] }), null);
  const row = {
    get section() {
      throw Error('호출금지');
    },
    paragraph: 0,
  };
  assert.equal(session.stamp(row), null);
});
test('에러로 증거 회수·clear·문서 세대 변경 뒤 옛 session 사용0', () => {
  const { deps, host, issue } = harness(),
    c = content();
  const a = deps.prepare(c, issue(c), host);
  assert.equal(deps.prepare(c, token(), host), null);
  assert.equal(a.stamp(c.paragraphs[0]), null);
  const b = deps.prepare(c, issue(c, { scope: token(), resourceLease: token() }), host);
  assert.notEqual(a.key, b.key);
  deps.clear();
  assert.equal(b.stamp(c.paragraphs[0]), null);
});

import { layoutContent } from '../../../web/preview/layout.mjs';
import {
  createParagraphFlowReuse,
  withParagraphFlowReuse,
} from '../../../web/preview/paragraph-flow-reuse.mjs';
function measured(c, cache) {
  let visits = 0;
  const measure = (text) => {
    visits++;
    return { width: text.length * 8, height: 16 };
  };
  if (cache) measure.paragraphFlowReuse = cache;
  return { value: layoutContent(c, 200, measure), visits };
}
test('Native stamp 실제 flow hit와 전체 oracle 동치·메타키 검증 우회 계수', () => {
  const { deps, host, issue, delta } = harness(),
    a = content(),
    b = content('수정 본문');
  const cache = createParagraphFlowReuse();
  cache.beginNative(deps.prepare(a, issue(a), host));
  measured(a, cache);
  cache.beginNative(deps.prepare(b, issue(b, delta), host));
  const actual = measured(b, cache),
    expected = measured(b);
  assert.deepEqual(actual.value, expected.value);
  assert(actual.visits < expected.visits);
  assert.equal(cache.stats().environmentKeyCalls, 0);
  assert.equal(cache.stats().paragraphKeyCalls, 0);
  assert(cache.stats().nativeParagraphBypass > 0);
  assert.equal(cache.stats().hits, 1);
});
test('같은 ID 파생 문단은 Native stamp 우회 없이 현재 값 검증', () => {
  const { deps, host, issue } = harness(),
    c = content(),
    cache = createParagraphFlowReuse();
  cache.beginNative(deps.prepare(c, issue(c), host));
  measured(c, cache);
  const changed = {
    ...c,
    paragraphs: c.paragraphs.map((p, i) => (i === 0 ? { ...p, text: '파생 draft' } : p)),
  };
  const before = cache.stats().paragraphKeyCalls;
  assert.deepEqual(measured(changed, cache).value, measured(changed).value);
  assert(cache.stats().paragraphKeyCalls > before);
});
test('host miss는 Native 자원 증거가 같아도 이전 행 재사용0', () => {
  const { deps, host, issue } = harness(),
    c = content(),
    e = issue(c),
    cache = createParagraphFlowReuse();
  cache.beginNative(deps.prepare(c, e, host));
  measured(c, cache);
  host.fontEpoch++;
  cache.beginNative(deps.prepare(c, e, host));
  assert.equal(measured(c, cache).visits, measured(c).visits);
  assert.equal(cache.stats().hits, 0);
});
test('Native 증거가 빠진 다음 모델은 generic validator로 돌아감', () => {
  const { deps, host, issue } = harness(),
    c = content(),
    cache = createParagraphFlowReuse();
  cache.beginNative(deps.prepare(c, issue(c), host));
  measured(c, cache);
  assert.equal(deps.prepare(c, {}, host), null);
  cache.begin({ font: '본문' }, token());
  assert.deepEqual(measured(c, cache).value, measured(c).value);
  assert(cache.stats().environmentKeyCalls > 0);
  assert(cache.stats().paragraphKeyCalls > 0);
});

for (const size of [4095, 4096, 4097, 8193, 16385]) {
  test(`전체 ${size}행 원본 membership은 한 번 순회하고 stamp 조회는 별도 선형 계수`, () => {
    const { deps, host, issue } = harness();
    let fallbackFindCalls = 0;
    const rows = Array.from({ length: size }, (_, paragraph) =>
      Object.freeze({ section: 0, paragraph, text: '본문' }),
    );
    Object.defineProperty(rows, 'find', {
      value() {
        fallbackFindCalls++;
        throw Error('선형 재검색 금지');
      },
    });
    Object.freeze(rows);
    const c = Object.freeze({
      format: 'hwp5',
      limited: false,
      totalParagraphs: size,
      paragraphs: rows,
    });
    const evidence = issue(c),
      session = deps.prepare(c, evidence, host);
    assert(session);
    for (let round = 0; round < 2; round++)
      for (const row of rows) assert.equal(session.stamp(row), 'native:baseline');
    assert.equal(deps.stats().membershipEntryVisits, size);
    assert.equal(deps.stats().membershipQueries, size * 2);
    assert.equal(deps.stats().membershipRebuilds, 1);
    assert.equal(fallbackFindCalls, 0);
    const repeated = deps.prepare(c, evidence, host);
    assert(repeated);
    assert.equal(deps.stats().membershipEntryVisits, size);
    assert.equal(deps.stats().membershipRebuilds, 1);
    assert.equal(repeated.stamp({ ...rows[0] }), null);
    console.log(
      JSON.stringify({
        scope: '소비자 합성 복잡도·실Native아님',
        size,
        entryVisits: deps.stats().membershipEntryVisits,
        stampQueries: deps.stats().membershipQueries,
        successfulStampQueries: size * 2,
        rejectedCloneQueries: 1,
        repeatedProjectionEntryVisits: 0,
        fallbackFindCalls,
      }),
    );
  });
}

test('불완전한 limited/window/부분 view는 Native 등록표 모양으로 전체 기하를 위장하지 않음', () => {
  const { deps, host, issue } = harness(),
    base = content();
  for (const patch of [
    { limited: true },
    { window: {} },
    { viewKind: 'owner-window-patch' },
    { totalParagraphs: 10 },
  ]) {
    const c = Object.freeze({ ...base, ...patch });
    assert.equal(deps.prepare(c, issue(c), host), null);
    assert.equal(deps.stats().membershipEntries, 0);
  }
});
test('문서 clear 후 전체 row membership을 해제하고 외부 mutable row는 거부', () => {
  const { deps, host, issue } = harness(),
    c = content();
  const before = deps.prepare(c, issue(c), host);
  assert(before);
  deps.clear();
  assert.equal(deps.stats().membershipEntries, 0);
  assert.equal(before.stamp(c.paragraphs[0]), null);
  const mixed = Object.freeze({
    format: 'hwp5',
    limited: false,
    paragraphs: Object.freeze([{ section: 0, paragraph: 0, text: '가변' }]),
  });
  assert.equal(deps.prepare(mixed, issue(mixed), host), null);
});

test('wrapper 정확 의존성은 context로 검증하고 원본 행만 Native stamp 사용', () => {
  const { deps, host, issue } = harness(),
    c = content(),
    cache = createParagraphFlowReuse();
  cache.beginNative(deps.prepare(c, issue(c), host));
  let factor = 1;
  function run(useCache) {
    const base = (text) => ({ width: text.length * 8, height: 16 });
    if (useCache) base.paragraphFlowReuse = cache;
    const wrapper = withParagraphFlowReuse(
      base,
      (text) => ({ width: text.length * 8 * factor, height: 16 }),
      () => ({ factor }),
    );
    return layoutContent(c, 100, wrapper);
  }
  run(true);
  const before = cache.stats();
  assert.deepEqual(run(true), run(false));
  assert.equal(cache.stats().hits - before.hits, 2);
  assert(cache.stats().nativeParagraphBypass > 0);
  assert.equal(cache.stats().paragraphKeyCalls, 0);
  factor = 4;
  const previous = cache.stats().hits;
  assert.deepEqual(run(true), run(false));
  assert.equal(cache.stats().hits, previous);
});

test('wrapper 내부 파생 행은 등록 원본으로 승격하지 않고 값 검증', () => {
  const { deps, host, issue } = harness(),
    c = content(),
    cache = createParagraphFlowReuse();
  cache.beginNative(deps.prepare(c, issue(c), host));
  const derived = { ...c, paragraphs: c.paragraphs.map((p) => ({ ...p, text: p.text + '추가' })) };
  const base = (text) => ({ width: text.length * 8, height: 16 });
  base.paragraphFlowReuse = cache;
  const wrapper = withParagraphFlowReuse(
    base,
    (...args) => base(...args),
    () => ({ kind: '원본과다른행' }),
  );
  assert.deepEqual(
    layoutContent(derived, 100, wrapper),
    layoutContent(derived, 100, (text) => ({ width: text.length * 8, height: 16 })),
  );
  assert.equal(cache.stats().nativeParagraphBypass, 0);
  assert(cache.stats().paragraphKeyCalls > 0);
});

test('clear 전후 키 순회 누적계수는 폐기 memo를 빠뜨리지 않음', () => {
  const cache = createParagraphFlowReuse();
  cache.begin({ value: '첫값' }, token());
  const before = cache.stats();
  assert(before.totalKeyWalkVisits > 0);
  cache.clear();
  const cleared = cache.stats();
  assert.equal(cleared.totalKeyWalkVisits, before.totalKeyWalkVisits);
  assert(cleared.memoGeneration > before.memoGeneration);
  cache.begin({ value: '다음값' }, token());
  assert(cache.stats().totalKeyWalkVisits > cleared.totalKeyWalkVisits);
});
