import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicText } from '../../tools/pages-demo/bundle-validation.mjs';

for (const quote of ['"', "'", '`']) {
  for (const asset of ['worker.js', 'hwpjs.wasm']) {
    test(`published runtime rejects origin-root ${asset} with ${quote}`, () => {
      assert.throws(
        () =>
          assertPublicText('assets/app.js', Buffer.from(`load(${quote}/hwpjs/${asset}${quote})`)),
        /OriginRootRuntimeAssetInPublishedText/,
      );
    });
  }
}

test('bundle-relative runtime assets and unrelated routes remain valid', () => {
  assertPublicText(
    'assets/app.js',
    Buffer.from("load(new URL('../hwpjs/hwpjs.wasm', import.meta.url)); fetch('/api/document')"),
  );
});
