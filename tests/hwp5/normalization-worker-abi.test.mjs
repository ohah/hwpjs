import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withoutNormalizationExport } from './normalization-export-fixture.mjs';

test('Worker never grants normalized editing without the normalization metadata ABI', async (t) => {
  const wasm = withoutNormalizationExport(
    readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
    'hwp5_edit_normalization_info',
  );
  const input = Buffer.from(
    readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp'),
  );
  const sectorSize = 2 ** input.readUInt16LE(30),
    root = (input.readUInt32LE(48) + 1) * sectorSize;
  input.writeBigUInt64LE(17n, root + 100);
  const before = Buffer.from(input),
    previousSelf = globalThis.self,
    previousFetch = globalThis.fetch,
    replies = [];
  globalThis.self = {
    postMessage(message) {
      replies.push(message);
    },
  };
  globalThis.fetch = async () => new Response(wasm);
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  });
  await import(`../../web/preview/reader-worker.mjs?normalization-metadata-abi=${Date.now()}`);
  const send = async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    return replies.shift();
  };
  const loaded = await send({ kind: 'load', bytes: input });
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.content.normalizationEditingAvailable, false);
  assert.equal(
    (await send({ kind: 'enable', normalizeObservedCfb: true })).error,
    'Hwp5NormalizationAbiUnavailable',
  );
  assert.equal((await send({ kind: 'save' })).error, 'EditorNotOpen');
  assert.deepEqual(input, before);
});
