import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativePictureRefreshGate } from '../../web/preview/native-picture-refresh-gate.mjs';
// Detached predicate inputs, never entries in the production Native authority registry.
const token = () => Object.freeze({});
function fixture(provider = token()) {
  const observations = new WeakMap();
  const gate = createNativePictureRefreshGate((evidence, content) => {
    const row = observations.get(evidence);
    return row?.content === content ? row.value : undefined;
  });
  const baseline = {
    kind: 'full-baseline',
    scope: token(),
    resourceLease: token(),
    nativeEpoch: '2',
    nativeRevision: 1,
    ownerTextRunGeneration: 0,
  };
  const next = {
    ...baseline,
    kind: 'exclusive-text',
    nativeEpoch: '3',
    nativeRevision: 2,
    beforeEpoch: '2',
    beforeRevision: 1,
    ownerTextRunGeneration: 1,
  };
  function observe(value, ...epochs) {
    const epoch = epochs.length ? epochs[0] : provider;
    const content = {},
      evidence = {};
    observations.set(evidence, { content, value });
    return gate.observe(content, evidence, epoch);
  }
  return { gate, observe, baseline, next, provider };
}
test('r2 gate는 첫 baseline을 재사용하지 않고 검증 callback의 연속 text delta만 유지한다', () => {
  const f = fixture();
  assert.equal(f.observe(f.baseline), false);
  assert.equal(f.observe(f.next), true);
});
test('host token만 같고 reader가 증거를 거부하면 유지하지 않고 연속성도 끊는다', () => {
  const f = fixture();
  f.observe(f.baseline);
  assert.equal(f.gate.observe({}, {}, f.provider), false);
  assert.equal(f.observe(f.next), false);
});
test('missing·mutable·rich·array·primitive provider token은 보존 권한이 아니다', () => {
  for (const bad of [
    undefined,
    null,
    {},
    Object.freeze({ version: 1 }),
    Object.freeze([]),
    'same',
    1,
  ]) {
    const f = fixture();
    f.observe(f.baseline);
    assert.equal(f.observe(f.next, bad), false);
  }
});
test('provider identity 변경은 이전 job을 보존하지 않으며 새 연속성만 다시 시작한다', () => {
  const f = fixture(),
    other = token();
  f.observe(f.baseline);
  assert.equal(f.observe(f.next, other), false);
  assert.equal(
    f.observe(
      {
        ...f.next,
        nativeEpoch: '4',
        nativeRevision: 3,
        beforeEpoch: '3',
        beforeRevision: 2,
        ownerTextRunGeneration: 2,
      },
      other,
    ),
    true,
  );
});
test('scope·lease·before epoch/revision·owner generation·baseline 불일치는 보존하지 않는다', () => {
  for (const delta of [
    { scope: token() },
    { resourceLease: token() },
    { beforeEpoch: '1' },
    { beforeRevision: 0 },
    { ownerTextRunGeneration: 2 },
    { kind: 'full-baseline' },
  ]) {
    const f = fixture();
    f.observe(f.baseline);
    assert.equal(f.observe({ ...f.next, ...delta }), false);
  }
});
test('clear 뒤 이전 연속성은 재사용하지 않는다', () => {
  const f = fixture();
  f.observe(f.baseline);
  f.gate.clear();
  assert.equal(f.observe(f.next), false);
});
test('reader가 거부한 별도 content/evidence 쌍은 유지 조건을 만족하지 못한다', () => {
  const f = fixture();
  f.observe(f.baseline);
  assert.equal(f.gate.observe({}, Object.freeze({}), f.provider), false);
});
test('reader 예외는 전파하지 않고 보수적 refresh로 남긴다', () => {
  const gate = createNativePictureRefreshGate(() => {
    throw Error('unavailable');
  });
  assert.equal(gate.observe({}, {}, token()), false);
});
test('frozen empty null-prototype provider도 같은 identity 계약으로만 사용한다', () => {
  const f = fixture(Object.freeze(Object.create(null)));
  assert.equal(f.observe(f.baseline), false);
  assert.equal(f.observe(f.next), true);
});

test('검증 reader의 history-text도 같은 provider·lease·전이 연속성이 필요하다', () => {
  const f = fixture();
  assert.equal(f.observe(f.baseline), false);
  assert.equal(f.observe({ ...f.next, kind: 'history-text' }), true);
  const broken = fixture();
  broken.observe(broken.baseline);
  assert.equal(broken.observe({ ...broken.next, kind: 'history-text', beforeRevision: 0 }), false);
});
test('알 수 없는 전이 kind는 동일 token·전이 값으로도 그림 보존을 허용하지 않는다', () => {
  const f = fixture();
  f.observe(f.baseline);
  assert.equal(f.observe({ ...f.next, kind: 'unknown-text' }), false);
});
