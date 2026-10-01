import { createMemory } from "./wasm-memory.mjs";
import { validateAbi } from "./abi.mjs";
import { inputBytes } from "./input.mjs";
import { decodeHwpxText } from "./hwpx-text-wire.mjs";

/** Read-only selected HWPX section events, not an editing or page model. */
export async function createHwpxReader(source) {
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  validateAbi(wasm);
  for (const name of ["hwpx_text_read", "hwpx_text_ptr", "hwpx_text_len", "hwpx_text_free"])
    if (typeof wasm[name] !== "function") throw new Error("HwpxTextAbiUnavailable");
  const memory = createMemory(wasm);
  let closed = false;
  return {
    readTextEvents(data) {
      if (closed) throw new Error("ReaderClosed");
      const bytes = inputBytes(data);
      if (bytes.length > 64 * 1024 * 1024) throw new RangeError("LimitExceeded");
      return memory.withBytes(bytes, (ptr, size) => {
        try {
          if (!wasm.hwpx_text_read(ptr, size)) throw memory.error();
          return decodeHwpxText(memory.copy(wasm.hwpx_text_ptr(), wasm.hwpx_text_len()));
        } finally { wasm.hwpx_text_free(); }
      });
    },
    close() { if (!closed) wasm.hwpx_text_free(); closed = true; },
  };
}
