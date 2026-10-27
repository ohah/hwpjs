import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecodedResourceGeometryEpoch } from '../../../web/preview/decoded-resource-geometry-epoch.mjs';
const bitmap = () => ({ width: 1200, height: 153 });
const entry = () => ({ bitmap: bitmap(), error: null, refreshing: false });
test('같은 bitmap 재검증 완료는 기하 세대를 늘리지 않음', () => {
  const tracker = createDecodedResourceGeometryEpoch({}),
    e = entry();
  tracker.observe(e);
  const n = tracker.value;
  for (let i = 0; i < 100; i++) tracker.observe(e);
  assert.equal(tracker.value, n);
});
test('실제 크기·bitmap·오류 변화는 각각 무효화', () => {
  const tracker = createDecodedResourceGeometryEpoch({}),
    e = entry();
  tracker.observe(e);
  let n = tracker.value;
  e.bitmap.width++;
  tracker.observe(e);
  assert.equal(tracker.value, ++n);
  e.bitmap = bitmap();
  tracker.observe(e);
  assert.equal(tracker.value, ++n);
  e.error = '디코딩 실패';
  tracker.observe(e);
  assert.equal(tracker.value, ++n);
  e.error = null;
  tracker.observe(e);
  assert.equal(tracker.value, ++n);
});
test('알 수 없는 bitmap getter는 실행하지 않고 매번 보수 무효화', () => {
  let gets = 0;
  const tracker = createDecodedResourceGeometryEpoch({}),
    e = entry();
  Object.defineProperty(e.bitmap, 'width', {
    get() {
      gets++;
      return 1200;
    },
  });
  tracker.observe(e);
  const n = tracker.value;
  tracker.observe(e);
  assert.equal(tracker.value, n + 1);
  assert.equal(gets, 0);
});
test('entry accessor와 refresh 중간 상태는 재사용하지 않음', () => {
  let gets = 0;
  const tracker = createDecodedResourceGeometryEpoch({}),
    e = entry();
  Object.defineProperty(e, 'bitmap', {
    get() {
      gets++;
      return null;
    },
  });
  tracker.observe(e);
  tracker.observe(e);
  assert.equal(gets, 0);
  assert.equal(tracker.value, 2);
  const f = entry();
  tracker.observe(f);
  const n = tracker.value;
  f.refreshing = true;
  tracker.observe(f);
  f.refreshing = false;
  tracker.observe(f);
  assert.equal(tracker.value, n + 2);
});
test('문서 전환·decoder 교체 clear는 같은 entry도 새 기하 기준', () => {
  const tracker = createDecodedResourceGeometryEpoch({}),
    e = entry();
  tracker.observe(e);
  const n = tracker.value;
  tracker.clear();
  assert.equal(tracker.value, n + 1);
  tracker.observe(e);
  assert.equal(tracker.value, n + 2);
});
test('독립 entry 수명은 identity별로 분리하고 null bitmap 상태도 비교', () => {
  const tracker = createDecodedResourceGeometryEpoch({}),
    a = entry(),
    b = entry();
  a.bitmap = null;
  tracker.observe(a);
  tracker.observe(b);
  const n = tracker.value;
  tracker.observe(a);
  tracker.observe(b);
  assert.equal(tracker.value, n);
  a.bitmap = bitmap();
  tracker.observe(a);
  assert.equal(tracker.value, n + 1);
});
