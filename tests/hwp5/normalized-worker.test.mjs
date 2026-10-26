import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("Worker requires explicit normalization and preserves normalized undo baseline", async (t) => {
  if (!existsSync("reference/rhwp/samples/issue5447/3차원묶은세로막대형-행추가.hwp")) {
    t.skip("RHWP reference fixture is unavailable");
    return;
  }
  const previousSelf = globalThis.self,
    previousFetch = globalThis.fetch,
    replies = [];
  globalThis.self = {
    postMessage(message) {
      replies.push(message);
    },
  };
  globalThis.fetch = async () =>
    new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  });
  await import(`../../web/preview/reader-worker.mjs?normalization=${Date.now()}`);
  const send = async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    return replies.shift();
  };
  const input = readFileSync("reference/rhwp/samples/issue5447/3차원묶은세로막대형-행추가.hwp");
  const before = Buffer.from(input);
  const loaded = await send({ kind: "load", bytes: input });
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.content.normalizationEditingAvailable, true);
  assert.equal((await send({ kind: "enable" })).error, "RepairedSourceUnsupported");
  assert.equal(
    (await send({ kind: "enable", normalizeObservedCfb: "yes" })).error,
    "InvalidNormalizationPolicy",
  );
  assert.equal(
    (await send({ kind: "enable", normalizeObservedCfb: true, distribution: true })).error,
    "NotDistributionDocument",
  );
  const enabled = await send({ kind: "enable", normalizeObservedCfb: true });
  assert.equal(enabled.error, undefined);
  assert.equal(enabled.content.characterShapesError, null);
  assert(enabled.content.characterShapes.length > 0);
  assert.equal(enabled.content.normalizationInfo.historyBaseline, "normalized");
  assert.equal(enabled.historyAvailable, true);
  const baseline = await send({ kind: "save" });
  assert.equal(baseline.error, undefined);
  assert.notDeepEqual(Buffer.from(baseline.bytes), input);
  const changed = await send({
    kind: "splice",
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 0,
    text: "워커😀",
  });
  assert.equal(changed.error, undefined);
  assert.equal(changed.content.characterShapesError, null);
  assert.equal(changed.content.normalizationInfo.normalized, true);
  assert.equal((await send({ kind: "save" })).error, "LayoutReflowRequired");
  const saved = await send({ kind: "save", allowStaleLayout: true });
  assert.equal(saved.error, undefined);
  assert.equal((await send({ kind: "undo" })).error, undefined);
  assert.deepEqual((await send({ kind: "save" })).bytes, baseline.bytes);
  assert.equal((await send({ kind: "redo" })).error, undefined);
  assert.deepEqual((await send({ kind: "save", allowStaleLayout: true })).bytes, saved.bytes);
  const plain = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp");
  const next = await send({ kind: "load", bytes: plain });
  assert.equal(next.error, undefined);
  assert.equal(next.content.normalizationEditingAvailable, false);
  assert.equal(next.content.normalizationInfo.normalized, false);
  const hwpx = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/aligns.hwpx");
  const hwpxLoaded = await send({ kind: "load", format: "hwpx", bytes: hwpx });
  assert.equal(hwpxLoaded.error, undefined);
  for (const option of [true, false, "yes"])
    assert.equal(
      (await send({ kind: "enable", normalizeObservedCfb: option })).error,
      "UnsupportedNormalizationFormat",
    );
  const hwpxEnabled = await send({ kind: "enable" });
  assert.equal(hwpxEnabled.error, undefined);
  assert.equal(hwpxEnabled.historyAvailable, true);
  assert.deepEqual(input, before);
});
