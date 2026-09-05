import { ABI_VERSION, REQUIRED_FUNCTIONS } from "./abi-schema.mjs";

export function validateAbi(wasm) {
  if (typeof wasm.hwpjs_abi_version !== "function")
    throw new Error("Missing HWPJS ABI version");
  const actual = wasm.hwpjs_abi_version();
  if (actual !== ABI_VERSION)
    throw new Error(`Unsupported HWPJS ABI ${actual}; expected ${ABI_VERSION}`);
  for (const name of REQUIRED_FUNCTIONS) {
    if (typeof wasm[name] !== "function")
      throw new Error(`Missing HWPJS ABI export: ${name}`);
  }
  if (!(wasm.memory instanceof WebAssembly.Memory))
    throw new Error("Missing HWPJS ABI memory");
}
