import { createMemory } from "./wasm-memory.mjs";
import { validateAbi } from "./abi.mjs";
import { inputBytes } from "./input.mjs";

/** Shared lifetime and secret-buffer contract for explicit conversion. */
export async function createPasswordDecoder(source, prefix, unavailable) {
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  validateAbi(wasm);
  const api = {};
  for (const name of ["decrypt", "ptr", "len", "free"]) {
    api[name] = wasm[`${prefix}_${name}`];
    if (typeof api[name] !== "function") throw new Error(unavailable);
  }
  const memory = createMemory(wasm);
  let closed = false;
  return {
    decryptToPlaintext(data, password) {
      if (closed) throw new Error("DecoderClosed");
      const bytes = inputBytes(data);
      if (bytes.length > 64 * 1024 * 1024) throw new RangeError("LimitExceeded");
      if (typeof password === "string" && !password.isWellFormed())
        throw new TypeError("InvalidPasswordUnicode");
      const secret =
        typeof password === "string"
          ? new TextEncoder().encode(password)
          : inputBytes(password).slice();
      try {
        if (secret.length > 4096) throw new RangeError("LimitExceeded");
        return memory.withBytes(bytes, (ptr, size) =>
          memory.withSecretBytes(secret, (passwordPtr, passwordSize) => {
            try {
              const status = api.decrypt(ptr, size, passwordPtr, passwordSize);
              if (status === 0) throw memory.error();
              if (status === 2) return null;
              if (status !== 1) throw new Error("InvalidPasswordResult");
              return memory.copy(api.ptr(), api.len());
            } finally {
              api.free();
            }
          }),
        );
      } finally {
        secret.fill(0);
      }
    },
    close() {
      if (!closed) api.free();
      closed = true;
    },
  };
}
