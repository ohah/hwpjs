import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("actual Worker accepts a cloned compiled module without fetching and preserves load output", async t => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const module = await WebAssembly.compile(wasm), previousSelf = globalThis.self, previousFetch = globalThis.fetch, replies = [];
  let fetches = 0;
  globalThis.self = { postMessage: message => replies.push(message) };
  globalThis.fetch = async () => { fetches++; return new Response(wasm); };
  t.after(() => { globalThis.self = previousSelf; globalThis.fetch = previousFetch; });
  await import("../../web/preview/reader-worker.mjs?shared-module=" + Date.now());
  const send = async data => { await self.onmessage({ data }); assert.equal(replies.length, 1); return replies.shift(); };
  try {
    const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/aligns.hwpx");
    const before = await send({ kind: "load", format: "hwpx", bytes: input }); assert.equal(before.error, undefined);
    assert.equal(fetches, 1);
    const after = await send({ kind: "load", format: "hwpx", bytes: input, wasmModule: structuredClone(module) });
    assert.deepEqual(after, before); assert.equal(fetches, 1);
    const invalid = await send({ kind: "load", format: "hwpx", bytes: input, wasmModule: {} });
    assert.equal(invalid.error, "InvalidPreviewWasmModule"); assert.equal(fetches, 1);
  } finally { await send({ kind: "load", format: "close-audit", bytes: [] }); }
});
