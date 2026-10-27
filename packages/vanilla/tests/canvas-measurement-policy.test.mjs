import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasMeasurementPolicy } from '../../../web/preview/canvas-measurement-policy.mjs';
const epoch = () => Object.freeze({});
const context = () => ({
  measureText(text) {
    return { width: text.length * 8 };
  },
  font: '16px sans-serif',
  direction: 'ltr',
});
test('비표준 측정 함수는 명시 버전 없으면 identity를 신뢰하지 않음', () => {
  const ctx = context(),
    policy = createCanvasMeasurementPolicy(ctx, {});
  assert.equal(policy.current(), null);
  const version = epoch();
  assert(policy.current(version));
  assert.equal(policy.current(version), policy.current(version));
});
test('측정 함수 교체·복원은 같은 epoch라도 서로 다른 token', () => {
  const ctx = context(),
    policy = createCanvasMeasurementPolicy(ctx, {}),
    version = epoch();
  const original = ctx.measureText,
    first = policy.current(version);
  ctx.measureText = (text) => ({ width: text.length * 9 });
  const second = policy.current(version);
  assert.notEqual(first, second);
  ctx.measureText = original;
  assert.notEqual(second, policy.current(version));
});
test('동일 함수의 내부 가변 정책은 버전 갱신으로만 재사용 허용', () => {
  let width = 8;
  const ctx = { ...context(), measureText: (text) => ({ width: text.length * width }) };
  const policy = createCanvasMeasurementPolicy(ctx, {});
  assert.equal(policy.current(), null);
  const first = policy.current(epoch());
  width = 16;
  assert.equal(policy.current(), null);
  assert.notEqual(first, policy.current(epoch()));
});
test('측정/문맥 accessor는 검사 과정에서 실행0', () => {
  const ctx = context(),
    version = epoch();
  let calls = 0;
  Object.defineProperty(ctx, 'direction', {
    get() {
      calls++;
      return 'rtl';
    },
  });
  assert.equal(createCanvasMeasurementPolicy(ctx, {}).current(version), null);
  assert.equal(calls, 0);
  const other = context();
  Object.defineProperty(other, 'measureText', {
    get() {
      calls++;
      return () => ({ width: 0 });
    },
  });
  assert.equal(createCanvasMeasurementPolicy(other, {}).current(version), null);
  assert.equal(calls, 0);
});
test('문맥/폰트/descriptor/prototype 변화는 token 회전', () => {
  const ctx = context(),
    policy = createCanvasMeasurementPolicy(ctx, {}),
    version = epoch();
  let before = policy.current(version);
  for (const patch of [{ direction: 'rtl' }, { letterSpacing: '2px' }, { font: '18px serif' }]) {
    Object.assign(ctx, patch);
    const after = policy.current(version);
    assert.notEqual(after, before);
    before = after;
  }
  Object.defineProperty(ctx, 'measureText', { writable: false });
  let after = policy.current(version);
  assert.notEqual(after, before);
  before = after;
  Object.setPrototypeOf(ctx, Object.create(null));
  after = policy.current(version);
  assert.notEqual(after, before);
});
test('mutable/비어있지 않은 명시 policy token은 fallback', () => {
  const policy = createCanvasMeasurementPolicy(context(), {});
  assert.equal(policy.current({}), null);
  assert.equal(policy.current(Object.freeze({ child: {} })), null);
});

test('native 문자열인 bound 가변 측정 함수는 명시 버전 없이 권위를 얻지 않음', () => {
  let width = 10;
  const measureText = (() => ({ width })).bind(null);
  const Constructor = function () {}.bind(null);
  Object.defineProperty(Constructor, 'name', { value: 'CanvasRenderingContext2D' });
  const prototype = { measureText };
  Object.defineProperty(Constructor, 'prototype', { value: prototype });
  const ctx = Object.create(prototype);
  const policy = createCanvasMeasurementPolicy(ctx, { CanvasRenderingContext2D: Constructor });
  assert.match(Function.prototype.toString.call(measureText), /native code/);
  assert.equal(policy.current(), null);
  width = 20;
  assert.equal(ctx.measureText().width, 20);
  assert.equal(policy.current(), null);
  const epoch = Object.freeze({});
  assert(policy.current(epoch));
});
