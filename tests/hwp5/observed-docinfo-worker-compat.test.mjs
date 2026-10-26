import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trackedDemoFixtures } from '../../web/preview/fixture-inventory.mjs';

test('observed capability preserves every other tracked HWP5 load field without silently opening a policy', async (t) => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
    module = await WebAssembly.compile(wasm);
  const originalExports = WebAssembly.Module.exports,
    previousSelf = globalThis.self,
    replies = [];
  const names = ['hwp5_edit_open_observed_docinfo', 'hwp5_edit_observed_docinfo_diagnostics'];
  const available = names.every((name) => originalExports(module).some((row) => row.name === name));
  let legacy = false;
  WebAssembly.Module.exports = (value) =>
    originalExports(value).filter((row) => !legacy || !names.includes(row.name));
  globalThis.self = { postMessage: (value) => replies.push(value) };
  t.after(() => {
    WebAssembly.Module.exports = originalExports;
    globalThis.self = previousSelf;
  });
  await import(`../../web/preview/reader-worker.mjs?observed-compat=${Math.random()}`);
  const send = async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    return replies.shift();
  };
  const fixtures = trackedDemoFixtures.filter((row) => row.id.endsWith('.hwp'));
  assert.equal(fixtures.length, 55);
  let loaded = 0,
    encrypted = 0;
  try {
    for (const fixture of fixtures) {
      const bytes = readFileSync(fixture.path),
        original = Buffer.from(bytes);
      legacy = true;
      const before = await send({ kind: 'load', bytes, wasmModule: module }),
        fingerprint = JSON.stringify(before);
      legacy = false;
      const after = await send({ kind: 'load', bytes, wasmModule: module });
      assert.equal(after.error, before.error, fixture.path);
      if (after.error) {
        assert.equal(after.error, 'UnsupportedEncryption');
        assert.equal(fixture.id, 'password-12345.hwp');
        encrypted++;
      } else {
        const { observedDocInfoEditingAvailable, observedDocInfoDiagnostics, ...body } =
          after.content;
        assert.deepEqual(body, before.content, fixture.path);
        assert.equal(observedDocInfoDiagnostics, available ? null : undefined);
        assert.equal(typeof observedDocInfoEditingAvailable, available ? 'boolean' : 'undefined');
        loaded++;
      }
      assert.equal(JSON.stringify(before), fingerprint);
      assert.deepEqual(bytes, original);
      assert.deepEqual(readFileSync(fixture.path), original);
    }
    assert.equal(loaded, 54);
    assert.equal(encrypted, 1);
    t.diagnostic(
      JSON.stringify({
        paths: fixtures.length,
        loaded,
        encrypted,
        optionalObservedCapability: available,
        scope: 'load response parity except two declared fields; not editing or layout equality',
      }),
    );
  } finally {
    await send({ kind: 'load', format: 'close-audit', bytes: [] });
  }
});
