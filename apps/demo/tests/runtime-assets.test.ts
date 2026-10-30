import test from 'node:test';
import assert from 'node:assert/strict';
import { demoRuntimeAssets } from '../src/runtime-assets.ts';

for (const prefix of ['/', '/hwpjs/editor/', '/docs/editor/', '/nested/project/editor/']) {
  test(`runtime assets stay inside the published bundle at ${prefix}`, () => {
    const urls = demoRuntimeAssets(`https://example.test${prefix}assets/app.js`);
    assert.equal(Object.hasOwn(urls, 'workerURL'), false);
    assert.equal(Object.hasOwn(urls, 'workerFactory'), false);
    assert.equal(urls.wasmURL.href, `https://example.test${prefix}hwpjs/hwpjs.wasm`);
  });
}

test('module cache keys do not change the runtime directory', () => {
  const urls = demoRuntimeAssets('https://example.test/hwpjs/editor/assets/app.js?v=2#module');
  assert.deepEqual(Object.keys(urls), ['wasmURL']);
  assert.equal(urls.wasmURL.href, 'https://example.test/hwpjs/editor/hwpjs/hwpjs.wasm');
});
