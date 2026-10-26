import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { inspect } from './style-preservation/text-record-oracle.mjs';

for (const missing of [false, true])
  test(`distribution Worker normalization capability and explicit opening; missing export=${missing}`, async (t) => {
    if (!existsSync('reference/rhwp/samples/hwp-3.0-HWPML.hwp')) {
      t.skip('RHWP reference fixture is unavailable');
      return;
    }
    const previousSelf = globalThis.self,
      previousFetch = globalThis.fetch,
      replies = [];
    const wasm = Buffer.from(readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'));
    if (missing) {
      const at = wasm.indexOf(Buffer.from('hwp5_edit_open_normalized_distribution'));
      assert(at >= 0);
      wasm[at] = 120;
    }
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
    await import(
      `../../web/preview/reader-worker.mjs?normalized-distribution=${missing}-${Date.now()}`
    );
    const send = async (data) => {
      await self.onmessage({ data });
      assert.equal(replies.length, 1);
      return replies.shift();
    };
    const path = 'reference/rhwp/samples/hwp-3.0-HWPML.hwp',
      input = readFileSync(path);
    const loaded = await send({ kind: 'load', bytes: input });
    assert.equal(loaded.error, undefined);
    assert.equal(loaded.content.readOnly, true);
    assert.equal(loaded.content.distributionEditingAvailable, !missing);
    assert.equal(loaded.content.normalizationEditingAvailable, !missing);
    assert.equal((await send({ kind: 'save' })).error, 'EditorNotOpen');
    assert.equal(
      (await send({ kind: 'enable', distribution: true })).error,
      'RepairedSourceUnsupported',
    );
    const enabled = await send({ kind: 'enable', distribution: true, normalizeObservedCfb: true });
    if (missing) {
      assert.equal(enabled.error, 'Hwp5NormalizedDistributionAbiUnavailable');
      assert.equal(enabled.applied, false);
      assert.equal((await send({ kind: 'save' })).error, 'EditorNotOpen');
      assert.deepEqual(readFileSync(path), input);
      return;
    }
    assert.equal(enabled.error, undefined);
    assert.equal(enabled.historyAvailable, true);
    assert.equal(enabled.content.normalizationInfo.historyBaseline, 'normalized');
    const saved = await send({ kind: 'save' });
    assert.equal(saved.error, undefined);
    assert.deepEqual(inspect(saved.bytes).streams, inspect(input).streams);
    const plain = await send({
      kind: 'load',
      bytes: readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp'),
    });
    assert.equal(plain.error, undefined);
    assert.equal(plain.content.normalizationEditingAvailable, false);
    assert.equal(plain.content.distributionEditingAvailable, false);
    assert.equal(plain.content.normalizationInfo.normalized, false);
    assert.deepEqual(readFileSync(path), input);
  });
