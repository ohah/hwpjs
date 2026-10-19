// One compilation per page, shared by fresh document Workers; failures may retry.
export function createPreviewWasmModuleLoader({ fetchImpl = globalThis.fetch, compile = WebAssembly.compile,
  url = new URL("../../zig-out/bin/hwpjs.wasm", import.meta.url) } = {}) {
  let pending = null;
  return () => {
    if (!pending) pending = (async () => {
      const response = await fetchImpl(url, { cache: "no-cache" });
      if (!response.ok) throw new Error(`WASM HTTP ${response.status}: 먼저 Zig 빌드를 실행하세요.`);
      return compile(await response.arrayBuffer());
    })().catch(error => { pending = null; throw error; });
    return pending;
  };
}
