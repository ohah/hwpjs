import { createMemory } from "./wasm-memory.mjs";
import { validateAbi } from "./abi.mjs";
import { inputBytes } from "./input.mjs";
import { decodeHwp5Text } from "./hwp5-text-wire.mjs";

/** Read-only HWP5 paragraph-token preview; not a complete document model. */
export async function createHwp5Reader(source) {
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  validateAbi(wasm);
  const memory = createMemory(wasm);
  let closed = false;
  return {
    readText(data) {
      if (closed) throw new Error("ReaderClosed");
      const bytes = inputBytes(data);
      if (bytes.length > 64 * 1024 * 1024) throw new RangeError("LimitExceeded");
      return memory.withBytes(bytes, (ptr, size) => {
        try {
          if (!wasm.hwp5_text_read(ptr, size)) throw memory.error();
          return decodeHwp5Text(memory.copy(wasm.hwp5_text_ptr(), wasm.hwp5_text_len()));
        } finally {
          wasm.hwp5_text_free();
        }
      });
    },
    close() {
      if (!closed) wasm.hwp5_text_free();
      closed = true;
    },
  };
}
