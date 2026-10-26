/** All JS/WASM copies and temporary allocation ownership live here. */
export function createMemory(wasm) {
  const decoder = new TextDecoder();
  const copy = (ptr, length) =>
    length === 0
      ? new Uint8Array(0)
      : new Uint8Array(wasm.memory.buffer, ptr >>> 0, length).slice();
  const withBytes = (bytes, fn, secret = false) => {
    const ptr = wasm.cfb_alloc(bytes.length) >>> 0;
    if (!ptr) throw new Error("OutOfMemory");
    try {
      new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
      return fn(ptr, bytes.length);
    } finally {
      if (secret) new Uint8Array(wasm.memory.buffer, ptr, Math.max(bytes.length, 1)).fill(0);
      wasm.cfb_free(ptr, bytes.length);
    }
  };
  return {
    copy,
    error: () => new Error(decoder.decode(copy(wasm.cfb_error_ptr(), wasm.cfb_error_len()))),
    withBytes,
    withSecretBytes: (bytes, fn) => withBytes(bytes, fn, true),
  };
}
