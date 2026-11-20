// 공용 표시 스케줄러의 실제 DOM EventTarget 수명 검사입니다. 브라우저 증거가 아닙니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPresentationRefresh,
  observeSelectionPresentation,
} from '../src/presentation-refresh.ts';
test('Core 문단 선택 없이 DOM 선택 변경으로 최신 clipboard 가용성을 다시 읽는다', async () => {
  const root = new EventTarget();
  let selected = false;
  const seen = [],
    errors = [];
  const refresh = createPresentationRefresh(() => seen.push(selected));
  const stop = observeSelectionPresentation(
    root,
    () => refresh.request(),
    (e) => errors.push(e),
  );
  try {
    root.dispatchEvent(new Event('select'));
    selected = true;
    root.dispatchEvent(new Event('keyup'));
    await Promise.resolve();
    assert.deepEqual(seen, [true]);
    selected = false;
    root.dispatchEvent(new Event('input'));
    await Promise.resolve();
    assert.deepEqual(seen, [true, false]);
    assert.deepEqual(errors, []);
  } finally {
    stop();
    refresh.dispose();
  }
});
test('dispose 뒤 DOM 이벤트는 표시 갱신을 예약하지 않는다', async () => {
  const root = new EventTarget();
  let count = 0;
  const stop = observeSelectionPresentation(
    root,
    () => {
      count++;
      return undefined;
    },
    () => {},
  );
  stop();
  root.dispatchEvent(new Event('select'));
  root.dispatchEvent(new Event('keyup'));
  assert.equal(count, 0);
});
test('새 observer는 UI 예외를 기존 오류 경로에 전달한다', async () => {
  const errors = [];
  const root = new EventTarget();
  const stop = observeSelectionPresentation(
    root,
    () => Promise.reject(Error('표시실패')),
    (e) => errors.push(e.message),
  );
  root.dispatchEvent(new Event('pointerup'));
  await Promise.resolve();
  assert.deepEqual(errors, ['표시실패']);
  stop();
});
