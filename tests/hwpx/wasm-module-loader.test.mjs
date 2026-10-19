import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewWasmModuleLoader } from "../../web/preview/wasm-module-loader.mjs";

test("parallel and later document loads share one fetched compiled module", async () => {
  let fetches = 0, compilations = 0;
  const module = {};
  const load = createPreviewWasmModuleLoader({ url: "/candidate.wasm", fetchImpl: async (url, options) => {
    fetches++; assert.equal(url, "/candidate.wasm"); assert.equal(options.cache, "no-cache"); return new Response(new Uint8Array([1]));
  }, compile: async bytes => { compilations++; assert.equal(bytes.byteLength, 1); return module; } });
  const first = load(); assert.equal(load(), first);
  assert.deepEqual(await Promise.all([first, load()]), [module, module]);
  assert.equal(await load(), module);
  assert.equal(fetches, 1); assert.equal(compilations, 1);
});

test("HTTP and compilation failures clear the pending module and can retry", async () => {
  for (const phase of ["http", "compile"]) {
    let attempts = 0;
    const load = createPreviewWasmModuleLoader({ fetchImpl: async () => {
      attempts++; return new Response(new Uint8Array([1]), { status: phase === "http" && attempts === 1 ? 503 : 200 });
    }, compile: async () => { if (phase === "compile" && attempts === 1) throw Error("CompileFailed"); return "ready"; } });
    await assert.rejects(load(), phase === "http" ? /WASM HTTP 503/ : /CompileFailed/);
    assert.equal(await load(), "ready"); assert.equal(attempts, 2);
  }
});
