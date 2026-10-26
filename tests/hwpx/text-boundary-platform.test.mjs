import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import {
  currentTextBoundaryIdentity,
  createTextSegmenter,
  withTextBoundaries,
  createNativeGraphemeSegmenter,
} from '../../web/preview/text-boundary-platform.mjs';
test('Node의 실제 내장 constructor A-B-A는 독립 토큰과 kind cache를 보존', () => {
  const original = globalThis.Intl,
    a = original.Segmenter,
    b = runInNewContext('Intl.Segmenter');
  try {
    globalThis.Intl = { Segmenter: a };
    const tokenA = currentTextBoundaryIdentity(),
      valueA = createTextSegmenter('grapheme');
    assert.ok(tokenA);
    globalThis.Intl = { Segmenter: b };
    const tokenB = currentTextBoundaryIdentity(),
      valueB = createTextSegmenter('grapheme');
    assert.ok(tokenB);
    assert.notEqual(tokenA, tokenB);
    assert.notEqual(valueA, valueB);
    globalThis.Intl = { Segmenter: a };
    assert.equal(currentTextBoundaryIdentity(), tokenA);
    assert.equal(createTextSegmenter('grapheme'), valueA);
  } finally {
    globalThis.Intl = original;
  }
});
test('같은 mutable polyfill constructor의 closure 변경은 새 instance로 평가', () => {
  const original = globalThis.Intl;
  let policy = 'A',
    count = 0;
  class C {
    constructor() {
      this.policy = policy;
      count++;
    }
    segment(text) {
      return [{ index: 0, segment: text, input: text, policy: this.policy }];
    }
  }
  try {
    globalThis.Intl = { Segmenter: C };
    assert.equal(currentTextBoundaryIdentity(), null);
    const a = createTextSegmenter('grapheme');
    policy = 'B';
    assert.equal(currentTextBoundaryIdentity(), null);
    const b = createTextSegmenter('grapheme');
    assert.notEqual(a, b);
    assert.equal(a.policy, 'A');
    assert.equal(b.policy, 'B');
    assert.equal(count, 2);
  } finally {
    globalThis.Intl = original;
  }
});
test('내장 prototype.segment의 알 수 없는 교체는 cache 비적격이며 복원 가능', () => {
  const ctor = Intl.Segmenter,
    descriptor = Object.getOwnPropertyDescriptor(ctor.prototype, 'segment'),
    token = currentTextBoundaryIdentity();
  try {
    Object.defineProperty(ctor.prototype, 'segment', {
      ...descriptor,
      value: function (text) {
        return [{ index: 0, segment: text, input: text }];
      },
    });
    assert.equal(currentTextBoundaryIdentity(), null);
    assert.notEqual(createTextSegmenter('grapheme'), createTextSegmenter('grapheme'));
  } finally {
    Object.defineProperty(ctor.prototype, 'segment', descriptor);
  }
  assert.equal(currentTextBoundaryIdentity(), token);
});
test('Segmenter accessor의 추가 실행 없이 첫 실제 factory 선택을 보존', () => {
  const object = Intl,
    descriptor = Object.getOwnPropertyDescriptor(object, 'Segmenter'),
    original = object.Segmenter;
  let reads = 0;
  class Unknown {
    segment(text) {
      return [{ index: 0, segment: text, input: text }];
    }
  }
  try {
    Object.defineProperty(object, 'Segmenter', {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        return ++reads % 2 ? original : Unknown;
      },
    });
    assert.equal(currentTextBoundaryIdentity(), null);
    assert.equal(reads, 0);
    const actual = [...createTextSegmenter('grapheme').segment('ab')];
    assert.equal(reads, 1);
    reads = 0;
    const expected = [...new object.Segmenter('ko', { granularity: 'grapheme' }).segment('ab')];
    assert.deepEqual(actual, expected);
    assert.equal(reads, 1);
    assert.equal(currentTextBoundaryIdentity(), null);
    assert.equal(reads, 1);
  } finally {
    Object.defineProperty(object, 'Segmenter', descriptor);
  }
});
test('전역 Intl accessor도 query에서는 실행하지 않고 factory만 정상 소비', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Intl'),
    original = Intl;
  let reads = 0;
  try {
    Object.defineProperty(globalThis, 'Intl', {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        reads++;
        return original;
      },
    });
    assert.equal(currentTextBoundaryIdentity(), null);
    assert.equal(reads, 0);
    createTextSegmenter('grapheme').segment('A');
    assert.equal(reads, 1);
  } finally {
    Object.defineProperty(globalThis, 'Intl', descriptor);
  }
});
test('unknown getter 오류는 factory에서 원래대로 전파하며 Native 포트는 getter를 사용하지 않음', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Intl');
  let reads = 0;
  try {
    Object.defineProperty(globalThis, 'Intl', {
      configurable: true,
      get() {
        reads++;
        throw Error('원래 getter 오류');
      },
    });
    assert.equal(currentTextBoundaryIdentity(), null);
    assert.equal(reads, 0);
    assert.throws(() => createTextSegmenter('grapheme'), /원래 getter 오류/);
    assert.equal(reads, 1);
    withTextBoundaries({ segments: (text) => [{ index: 0, segment: text, input: text }] }, () => {
      assert.equal(currentTextBoundaryIdentity(), null);
      assert.equal([...createTextSegmenter('grapheme').segment('A')][0].segment, 'A');
    });
    assert.equal(reads, 1);
  } finally {
    Object.defineProperty(globalThis, 'Intl', descriptor);
  }
});
test('epoch 없는 포트는 frozen 메타데이터와 관계없이 cache만 비적격', () => {
  let calls = 0;
  const a = Object.freeze({
    capability: Object.freeze({ protocol: 'hwpjs.native-text-boundaries/1' }),
    segments(text) {
      calls++;
      return [{ index: 0, segment: text, input: text }];
    },
    word() {
      throw Error('NativeWordSegmentationUnavailable');
    },
  });
  const web = currentTextBoundaryIdentity();
  assert.ok(web);
  withTextBoundaries(a, () => {
    assert.equal(currentTextBoundaryIdentity(), null);
    assert.equal([...createNativeGraphemeSegmenter().segment('A')][0].segment, 'A');
  });
  assert.equal(calls, 1);
  assert.equal(currentTextBoundaryIdentity(), web);
});
const path = '../../web/preview/text-boundary-platform.mjs';
let id = 0;
const fresh = () => import(path + '?test=' + ++id);
test('ownsegment변이후identity한번회전', async () => {
  const m = await fresh(),
    a = m.createNativeGraphemeSegmenter(),
    token = m.currentTextBoundaryIdentity();
  const replacement = () => [];
  a.segment = replacement;
  const next = m.currentTextBoundaryIdentity(),
    b = m.createNativeGraphemeSegmenter();
  assert.notEqual(next, token);
  assert.equal(m.currentTextBoundaryIdentity(), next);
  assert.notEqual(b, a);
  assert.equal(a.segment, replacement);
  assert.equal([...b.segment('😀')].length, 1);
});
test('factory직접조회도변이instance재사용0', async () => {
  const m = await fresh(),
    a = m.createNativeGraphemeSegmenter();
  a.segment = () => [];
  assert.notEqual(m.createNativeGraphemeSegmenter(), a);
});
test('ownresolvedOptions accessor추가getter실행0', async () => {
  const m = await fresh(),
    a = m.createNativeGraphemeSegmenter(),
    old = m.currentTextBoundaryIdentity();
  let calls = 0;
  Object.defineProperty(a, 'resolvedOptions', {
    get() {
      calls++;
      throw Error('GetterMustNotRun');
    },
    configurable: true,
  });
  const token = m.currentTextBoundaryIdentity();
  assert.notEqual(token, old);
  assert.equal(calls, 0);
  assert.notEqual(m.createNativeGraphemeSegmenter(), a);
  assert.equal(calls, 0);
  assert.ok(Object.getOwnPropertyDescriptor(a, 'resolvedOptions').get);
});
test('instanceprototype변이면회전', async () => {
  const m = await fresh(),
    a = m.createNativeGraphemeSegmenter(),
    old = m.currentTextBoundaryIdentity(),
    proto = Object.create(Object.getPrototypeOf(a));
  Object.setPrototypeOf(a, proto);
  assert.notEqual(m.currentTextBoundaryIdentity(), old);
  assert.notEqual(m.createNativeGraphemeSegmenter(), a);
  assert.equal(Object.getPrototypeOf(a), proto);
});
test('wordcache변이가graphemeidentity불필요회전0', async () => {
  const m = await fresh(),
    token = m.currentTextBoundaryIdentity(),
    w = m.createNativeWordSegmenter();
  w.segment = () => [];
  assert.notEqual(m.createNativeWordSegmenter(), w);
  assert.equal(m.currentTextBoundaryIdentity(), token);
});
test('Nativeportepoch없음cacheoff유지', async () => {
  const m = await fresh(),
    p = {
      segments: (text) => [{ index: 0, segment: text }],
      word() {
        throw Error('NativeWordSegmentationUnavailable');
      },
    };
  m.withTextBoundaries(p, () => {
    assert.equal(m.currentTextBoundaryIdentity(), null);
    assert.equal([...m.createNativeGraphemeSegmenter().segment('A')][0].segment, 'A');
  });
});
