import { createReaderRuntime } from "./reader-runtime.mjs";

// Legacy URL resolution and transport stay at the Worker boundary.
const runtime = createReaderRuntime({
  allowReload: true,
  async loadWasmModule() {
    const response = await fetch("../../zig-out/bin/hwpjs.wasm", { cache: "no-cache" });
    if (!response.ok) throw new Error(`WASM HTTP ${response.status}: 먼저 Zig 빌드를 실행하세요.`);
    return WebAssembly.compile(await response.arrayBuffer());
  },
});
const transport = self;
transport.onmessage = async event => {
  try { transport.postMessage(await runtime.request(event.data)); }
  catch (error) {
    transport.postMessage({ origin: event.data?.origin, kind: event.data?.kind, applied: false, error: error.message || String(error) });
  } finally { delete event.data?.password; }
};
