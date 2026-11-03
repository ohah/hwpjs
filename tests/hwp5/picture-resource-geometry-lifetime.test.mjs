import test from 'node:test';
import assert from 'node:assert/strict';
import { createPictureResources } from '../../web/preview/picture-resources.mjs';
import { createNativePictureRefreshGate } from '../../web/preview/native-picture-refresh-gate.mjs';
import { createDecodedResourceGeometryEpoch } from '../../web/preview/decoded-resource-geometry-epoch.mjs';
import { createNativeGeometryDeps } from '../../web/preview/native-geometry-deps.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const bitmap = () => ({ width: 2, height: 3, close() {} });
const resources = (options = {}) =>
  createPictureResources({
    read: async () => new Uint8Array([1]),
    decode: async () => bitmap(),
    ...options,
  });

test('빈 저장소는 null 전용이며 닫힌 저장소는 거부', () => {
  const store = resources();
  assert.equal(store.hasOnlyNullBitmaps(), true);
  assert.equal(store.canRetainSettled(), true);
  store.close();
  assert.equal(store.hasOnlyNullBitmaps(), false);
  assert.equal(store.canRetainSettled(), false);
});

test('진행 중 원본 null을 허용하고 refresh는 기존 요청을 무효화', async () => {
  const input = deferred();
  let callbacks = 0;
  const store = resources({ read: () => input.promise, onChange: () => callbacks++ });
  const pending = store.load(0, 1);
  assert.equal(store.hasOnlyNullBitmaps(), true);
  assert.equal(store.canRetainSettled(), false);
  store.refresh();
  assert.equal(store.get(0, 1).pending, null);
  assert.equal(store.get(0, 1).refreshing, true);
  input.resolve(new Uint8Array([1]));
  await pending;
  assert.equal(callbacks, 0);
  assert.equal(store.get(0, 1).bitmap, null);
  store.close();
});

test('실패한 원본 null도 refresh 뒤 실제 reader를 다시 호출', async () => {
  let reads = 0;
  const store = resources({
    read() {
      reads++;
      throw Error('원본 읽기 실패');
    },
  });
  await store.load(0, 1);
  assert.equal(store.get(0, 1).error, '원본 읽기 실패');
  assert.equal(store.hasOnlyNullBitmaps(), true);
  assert.equal(store.canRetainSettled(), false);
  store.refresh();
  await store.load(0, 1);
  assert.equal(reads, 2);
  assert.equal(store.hasOnlyNullBitmaps(), true);
  store.close();
});

for (const value of [false, undefined, 0, '']) {
  test(`원본 bitmap의 falsey값은 정확한 null이 아님: ${String(value)}`, async () => {
    const store = resources({
      read() {
        throw Error('실패');
      },
    });
    await store.load(0, 1);
    store.get(0, 1).bitmap = value;
    assert.equal(store.hasOnlyNullBitmaps(), false);
    store.get(0, 1).bitmap = null;
    store.close();
  });
}

test('준비된 bitmap은 null 전용 거부, 기존 settled 보존 허용', async () => {
  const store = resources();
  await store.load(0, 1);
  assert.equal(store.hasOnlyNullBitmaps(), false);
  assert.equal(store.canRetainSettled(), true);
  store.close();
});

test('refresh 중 표시상 숨길 수 있는 실제 bitmap도 null 전용 거부', async () => {
  const store = resources();
  await store.load(0, 1);
  const original = store.get(0, 1).bitmap;
  store.refresh();
  assert.equal(store.get(0, 1).refreshing, true);
  assert.equal(store.get(0, 1).bitmap, original);
  assert.equal(store.hasOnlyNullBitmaps(), false);
  assert.equal(store.canRetainSettled(), false);
  store.close();
});

test('null과 bitmap이 섞인 원본은 전부 순회해 거부', async () => {
  const input = deferred();
  const store = resources({
    read: (_, node) => (node === 1 ? input.promise : Promise.resolve(new Uint8Array([1]))),
  });
  const pending = store.load(0, 1);
  await store.load(0, 2);
  assert.equal(store.get(0, 1).bitmap, null);
  assert.ok(store.get(0, 2).bitmap);
  assert.equal(store.hasOnlyNullBitmaps(), false);
  store.close();
  input.resolve(new Uint8Array([1]));
  await pending;
});

test('배경 entry도 같은 원본 검사에 포함', async () => {
  const input = deferred();
  const store = resources({ readBackground: () => input.promise });
  const pending = store.backgrounds.load(0, 7);
  assert.equal(store.hasOnlyNullBitmaps(), true);
  input.resolve(new Uint8Array([2]));
  await pending;
  assert.equal(store.hasOnlyNullBitmaps(), false);
  store.backgrounds.clear();
  assert.equal(store.hasOnlyNullBitmaps(), true);
  store.close();
});

test('늦은 decode는 refresh 뒤 원본에 게시하거나 callback하지 않음', async () => {
  const decoded = deferred();
  let callbacks = 0,
    released = 0;
  const store = resources({ decode: () => decoded.promise, onChange: () => callbacks++ });
  const pending = store.load(0, 1);
  await Promise.resolve();
  store.refresh();
  decoded.resolve({
    width: 2,
    height: 3,
    close() {
      released++;
    },
  });
  await pending;
  assert.equal(released, 1);
  assert.equal(callbacks, 0);
  assert.equal(store.hasOnlyNullBitmaps(), true);
  store.close();
});

test('닫힌 뒤 늦은 reader 완료는 entry와 callback을 되살리지 않음', async () => {
  const input = deferred();
  let callbacks = 0;
  const store = resources({ read: () => input.promise, onChange: () => callbacks++ });
  const pending = store.load(0, 1);
  store.close();
  input.resolve(new Uint8Array([1]));
  await pending;
  assert.equal(store.get(0, 1), null);
  assert.equal(callbacks, 0);
  assert.equal(store.hasOnlyNullBitmaps(), false);
});

for (const mode of ['기준선', '공급자 교체', '미확인']) {
  test(`실제 연속성 gate는 ${mode} 경계를 거부`, () => {
    const gate = createNativePictureRefreshGate((e) => e);
    const provider = Object.freeze({});
    const base = {
      scope: {},
      resourceLease: {},
      kind: 'full-baseline',
      nativeEpoch: '0',
      nativeRevision: 0,
      ownerTextRunGeneration: 0,
    };
    const next = {
      ...base,
      kind: 'exclusive-text',
      nativeEpoch: '1',
      nativeRevision: 1,
      beforeEpoch: '0',
      beforeRevision: 0,
      ownerTextRunGeneration: 1,
    };
    assert.equal(gate.observe({}, base, provider), false);
    if (mode === '기준선')
      assert.equal(gate.observe({}, { ...next, kind: 'full-baseline' }, provider), false);
    else if (mode === '공급자 교체') assert.equal(gate.observe({}, next, Object.freeze({})), false);
    else assert.equal(gate.observe({}, undefined, provider), false);
  });
}

test('실제 연속성 gate는 같은 provider의 정확한 owner 연결만 허용', () => {
  const gate = createNativePictureRefreshGate((e) => e);
  const provider = Object.freeze({});
  const base = {
    scope: {},
    resourceLease: {},
    kind: 'full-baseline',
    nativeEpoch: '0',
    nativeRevision: 0,
    ownerTextRunGeneration: 0,
  };
  const next = {
    ...base,
    kind: 'history-text',
    nativeEpoch: '1',
    nativeRevision: 1,
    beforeEpoch: '0',
    beforeRevision: 0,
    ownerTextRunGeneration: 1,
  };
  assert.equal(gate.observe({}, base, provider), false);
  assert.equal(gate.observe({}, next, provider), true);
  gate.clear();
  assert.equal(gate.observe({}, next, provider), false);
});

test('같은 null 오류 재완료는 epoch 유지, bitmap 완료는 다음 prepare 키 무효화', async () => {
  const epoch = createDecodedResourceGeometryEpoch();
  const paragraph = Object.freeze({ section: 0, paragraph: 0, text: '본문' });
  const content = Object.freeze({
    format: 'hwp5',
    limited: false,
    paragraphs: Object.freeze([paragraph]),
  });
  // 조회·소유권 경계의 순수 모형이며 실제 Native 발급 증거가 아닙니다.
  const evidence = {
    scope: {},
    resourceLease: {},
    kind: 'full-baseline',
    nativeEpoch: '0',
    nativeRevision: 0,
  };
  const geometry = createNativeGeometryDeps({ readEvidence: () => evidence });
  const host = {
    width: 100,
    scale: 1,
    dpr: 1,
    fontEpoch: 0,
    decodedResourceEpoch: 0,
    fontKey: '본문',
    textBoundaryIdentity: Object.freeze({}),
    measurementPolicy: Object.freeze({}),
  };
  let fail = true;
  const store = resources({
    read() {
      if (fail) throw Error('동일 오류');
      return new Uint8Array([1]);
    },
    onChange(section, node, kind) {
      epoch.observe(store.status(section, node, kind));
    },
  });
  await store.load(0, 1);
  const prepare = () =>
    geometry.prepare(content, evidence, { ...host, decodedResourceEpoch: epoch.value });
  const first = prepare();
  assert.ok(first);
  const firstEpoch = epoch.value,
    accepted = geometry.stats().accepted;
  store.refresh();
  await store.load(0, 1);
  assert.equal(epoch.value, firstEpoch);
  assert.equal(geometry.stats().accepted, accepted);
  assert.equal(prepare().key, first.key);
  fail = false;
  store.refresh();
  await store.load(0, 1);
  assert.ok(epoch.value > firstEpoch);
  assert.equal(geometry.stats().accepted, accepted + 1);
  const ready = prepare();
  assert.notEqual(ready.key, first.key);
  assert.equal(first.stamp(paragraph), null);
  assert.ok(ready.stamp(paragraph));
  store.close();
});
