import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOST_EPOCH_KEYS } from '../../../web/preview/host-epoch-readers.mjs';
import { createDemoSurfaceEnvironment } from '../src/surface-environment.ts';
test('공유 demo factory는 mount마다 독립 token을 만들고 세 framework 모두 같은 hook을 사용한다', () => {
  const a = createDemoSurfaceEnvironment(),
    b = createDemoSurfaceEnvironment();
  for (const key of HOST_EPOCH_KEYS) {
    assert.equal(a[key](), a[key]());
    assert.notEqual(a[key](), b[key]());
    assert(Object.isFrozen(a[key]()));
    assert.equal(Reflect.ownKeys(a[key]()).length, 0);
  }
  assert.notEqual(a.geometryMeasurementEpoch(), a.resourceProviderEpoch());
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.equal((main.match(/createDemoSurfaceEnvironment\(\)/g) ?? []).length, 3);
  assert(main.includes("from './surface-environment.ts'"));
});
