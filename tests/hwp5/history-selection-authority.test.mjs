import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistorySelectionStore } from '../../web/preview/history-selection.mjs';
const location = (unit) => ({
  anchor: { section: 0, paragraph: 0, unit },
  focus: { section: 0, paragraph: 0, unit },
});
const revisions = (current) => [current, ...Array.from({ length: current }, (_, i) => i)];

test('Native reachable 100/101/257개는 fallback 상한과 무관하게 baseline0을 보관한다', () => {
  for (const count of [100, 101, 257]) {
    const store = createHistorySelectionStore(3);
    store.retain([0], 0);
    store.remember(0, location(0));
    for (let revision = 1; revision < count; revision++) {
      store.retain(revisions(revision), revision);
      store.remember(revision, location(revision));
    }
    assert.equal(store.selection(0).focus.unit, 0);
    assert.equal(store.selection(count - 1).focus.unit, count - 1);
  }
});
test('Native가 제거한 baseline은 prune하고 비Native revision을 다시 기억하지 않는다', () => {
  const store = createHistorySelectionStore(2);
  store.retain([0, 1, 2, 3], 3);
  for (let i = 0; i < 4; i++) store.remember(i, location(i));
  store.retain([3, 1, 2], 3);
  assert.equal(store.selection(0), null);
  store.remember(0, location(9));
  store.remember(99, location(99));
  assert.equal(store.selection(0), null);
  assert.equal(store.selection(99), null);
  assert.equal(store.selection(1).focus.unit, 1);
});
test('낮은 revision Undo/Redo는 숫자 크기로 prune하지 않으며 branch만 Native 집합으로 제거한다', () => {
  const store = createHistorySelectionStore(2);
  store.retain([3, 0, 1, 2], 3);
  for (let i = 0; i < 4; i++) store.remember(i, location(i));
  store.retain([1, 0, 2, 3], 1);
  assert.equal(store.selection(3).focus.unit, 3);
  store.retain([0, 3, 2, 1], 0);
  assert.equal(store.selection(0).focus.unit, 0);
  store.retain([3, 0, 1, 2], 3);
  assert.equal(store.selection(1).focus.unit, 1);
  store.retain([4, 0, 1], 4);
  store.remember(4, location(4));
  assert.equal(store.selection(2), null);
  assert.equal(store.selection(3), null);
  assert.equal(store.selection(0).focus.unit, 0);
  assert.equal(store.selection(4).focus.unit, 4);
});
test('legacy V1 metadata 부재는 기존 fallback100이며 이전 Set 권위를 유지하지 않는다', () => {
  const store = createHistorySelectionStore();
  for (let i = 0; i < 101; i++) store.remember(i, location(i));
  assert.equal(store.selection(0), null);
  assert.equal(store.selection(1).focus.unit, 1);
  store.retain(revisions(256), 256);
  store.remember(0, location(0));
  store.retain(undefined, 256);
  for (let i = 257; i < 358; i++) store.remember(i, location(i));
  assert.equal(store.selection(0), null);
  assert.equal(store.selection(357).focus.unit, 357);
});
test('reset은 문서의 관측 Set과 위치를 함께 폐기하고 새 문서 fallback을 적용한다', () => {
  const store = createHistorySelectionStore(2);
  store.retain([0, 1, 2, 3], 3);
  store.remember(0, location(0));
  store.reset();
  assert.equal(store.selection(0), null);
  for (let i = 5; i < 8; i++) store.remember(i, location(i));
  assert.equal(store.selection(5), null);
  assert.equal(store.selection(7).focus.unit, 7);
});
test('u32/중복/누락 current/희소 배열/잘못된 목록은 검증 원자성을 지킨다', () => {
  const store = createHistorySelectionStore(2);
  store.retain([0, 1, 2], 2);
  store.remember(0, location(0));
  store.remember(1, location(1));
  store.remember(2, location(2));
  for (const list of [
    [0, 0],
    [0xffffffff],
    [-1],
    [1.5],
    [NaN],
    [Infinity],
    ['0'],
    // oxlint-disable-next-line unicorn/no-new-array -- 희소 배열을 거부하는 음성 oracle이므로 밀집 배열로 바꾸지 않는다.
    new Array(2),
    null,
    {},
    Array.from({ length: 65537 }, (_, i) => i),
  ]) {
    assert.throws(() => store.retain(list), /InvalidHistoryRevisions/);
    assert.equal(store.selection(0).focus.unit, 0);
  }
  assert.throws(() => store.retain([1, 2], 0));
  assert.throws(() => store.retain(undefined, NaN));
  store.remember(0, location(9));
  assert.equal(store.selection(0).focus.unit, 9);
  assert.equal(store.selection(1).focus.unit, 1);
});
test('65536은 프로토콜 최대 목록이지 JS의 Native 정책 default가 아니다', () => {
  const store = createHistorySelectionStore(1),
    list = Array.from({ length: 65536 }, (_, i) => i);
  store.retain(list, 65535);
  store.remember(0, location(0));
  store.remember(65535, location(1));
  assert.equal(store.selection(0).focus.unit, 0);
  assert.equal(store.selection(65535).focus.unit, 1);
});
test('명시 null/반환 복사/저장 복사와 clone 실패 원자성을 보존한다', () => {
  const store = createHistorySelectionStore(1);
  store.retain([0, 1], 1);
  const value = location(1);
  store.remember(0, value);
  value.focus.unit = 99;
  const read = store.selection(0);
  read.focus.unit = 88;
  assert.equal(store.selection(0).focus.unit, 1);
  assert.throws(() => store.remember(0, { callback() {} }));
  assert.equal(store.selection(0).focus.unit, 1);
  store.remember(0, null);
  assert.equal(store.selection(0), null);
  store.remember(1, location(2));
  assert.equal(store.selection(1).focus.unit, 2);
});
test('관측 목록은 복사 소유하며 외부 변경/빈 집합 뒤 재삽입으로 권위를 만들지 않는다', () => {
  const store = createHistorySelectionStore(1),
    list = [0, 1];
  store.retain(list, 1);
  list.length = 0;
  store.remember(0, location(0));
  assert.equal(store.selection(0).focus.unit, 0);
  store.retain([]);
  store.remember(0, location(9));
  assert.equal(store.selection(0), null);
  store.retain(undefined);
  store.remember(0, location(1));
  assert.equal(store.selection(0).focus.unit, 1);
});
