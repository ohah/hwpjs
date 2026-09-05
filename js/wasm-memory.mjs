/** All JS/WASM copies and temporary allocation ownership live here. */
export function createMemory(wasm) {
  const decoder = new TextDecoder();
  const copy = (ptr, length) =>
    new Uint8Array(wasm.memory.buffer, ptr, length).slice();
  return {
    copy,
    error: () =>
      new Error(
        decoder.decode(copy(wasm.cfb_error_ptr(), wasm.cfb_error_len())),
      ),
    withBytes(bytes, fn) {
      const ptr = wasm.cfb_alloc(bytes.length);
      if (!ptr) throw new Error("OutOfMemory");
      try {
        new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
        return fn(ptr, bytes.length);
      } finally {
        wasm.cfb_free(ptr, bytes.length);
      }
    },
  };
}
