// Compiled code only. Each document must still instantiate its own memory/state.
export const WASM_MODULE_CACHE_MAX_BYTES = 16 * 1024 * 1024;

interface Entry {
  bytes: Uint8Array<ArrayBuffer>;
  module: Promise<WebAssembly.Module>;
  digest?: Promise<ArrayBuffer>;
}

/** Internal ownership transfer: bytes must be a private immutable snapshot.
 * The public engine captures that snapshot before its first await. Never pass
 * caller-owned mutable bytes here. One entry bounds retained source/module data.
 */
export function createWasmModuleCache() {
  let current: Entry | undefined;
  const fingerprint = (bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> =>
    Promise.resolve().then(() => crypto.subtle.digest('SHA-256', bytes));
  function start(bytes: Uint8Array<ArrayBuffer>): Promise<WebAssembly.Module> {
    const entry: Entry = { bytes, module: WebAssembly.compile(bytes) };
    entry.module = entry.module.catch((cause: unknown) => {
      if (current === entry) current = undefined;
      throw cause;
    });
    current = entry;
    return entry.module;
  }
  async function compileOwned(bytes: Uint8Array<ArrayBuffer>): Promise<WebAssembly.Module> {
    if (bytes.byteLength > WASM_MODULE_CACHE_MAX_BYTES) {
      current = undefined;
      return WebAssembly.compile(bytes);
    }
    const previous = current;
    if (previous && previous.bytes.byteLength === bytes.byteLength) {
      let same = false;
      try {
        // First use compiles immediately; fingerprint work is deferred until
        // there is another request that could benefit from reusing that module.
        const expected = (previous.digest ??= fingerprint(previous.bytes));
        const [left, right] = await Promise.all([expected, fingerprint(bytes)]);
        const a = new Uint8Array(left),
          b = new Uint8Array(right);
        same = a.length === 32 && b.length === 32 && a.every((byte, index) => byte === b[index]);
      } catch {
        // Reuse is optional; unavailable fingerprinting must not replace the
        // existing compile/validation path or poison a later retry.
        previous.digest = undefined;
      }
      if (same) return previous.module;
    }
    return start(bytes);
  }
  return { compileOwned };
}
