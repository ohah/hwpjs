import test from 'node:test';
import assert from 'node:assert/strict';
import { createPictureResources } from '../../web/preview/picture-resources.mjs';
import { deferred, bitmap, tick } from './helpers/picture-resource-fixture.mjs';
test('warm 판정은 settled pending promise를 무시하고 read/decode pending·error를 거부한다', async () => {
  const read = deferred(),
    decode = deferred();
  const resources = createPictureResources({
    read: () => read.promise,
    decode: () => decode.promise,
  });
  try {
    const p = resources.load(0, 1);
    assert.equal(resources.canRetainSettled(), false);
    read.resolve(new Uint8Array([1]));
    await tick();
    assert.equal(resources.canRetainSettled(), false);
    decode.resolve(bitmap());
    await p;
    assert(resources.status(0, 1).pending instanceof Promise);
    assert.equal(resources.canRetainSettled(), true);
    resources.refresh();
    assert.equal(resources.canRetainSettled(), false);
  } finally {
    resources.close();
  }
  assert.equal(resources.canRetainSettled(), false);
});
test('StaleSurfaceResource 오류 entry는 refresh 뒤 current 재읽기·decode로 복구한다', async () => {
  let fail = true,
    reads = 0;
  const resources = createPictureResources({
    read: async () => {
      reads++;
      if (fail) throw Error('StaleSurfaceResource');
      return new Uint8Array([2]);
    },
    decode: async () => bitmap(),
  });
  try {
    await resources.load(0, 1);
    assert.equal(resources.status(0, 1).error, 'StaleSurfaceResource');
    assert.equal(resources.canRetainSettled(), false);
    fail = false;
    resources.refresh();
    await resources.load(0, 1);
    assert.equal(reads, 2);
    assert.equal(resources.canRetainSettled(), true);
    resources.clear();
    assert.equal(resources.stats().entries, 0);
  } finally {
    resources.close();
  }
});
test('clear가 지난 read의 부활을 막고 새 source의 bitmap만 유지한다', async () => {
  const first = deferred();
  let reads = 0;
  const resources = createPictureResources({
    read: () => (++reads === 1 ? first.promise : Promise.resolve(new Uint8Array([2]))),
    decode: async () => bitmap(),
  });
  try {
    const old = resources.load(0, 1);
    resources.clear();
    await resources.load(0, 1);
    const current = resources.status(0, 1).bitmap;
    first.resolve(new Uint8Array([1]));
    await old;
    assert.equal(resources.status(0, 1).bitmap, current);
    assert.equal(resources.canRetainSettled(), true);
  } finally {
    resources.close();
  }
});
