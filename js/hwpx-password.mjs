import { createPasswordDecoder } from "./password-decoder.mjs";

/** Explicit conversion only. Returned ZIP no longer has password protection. */
export function createHwpxPasswordDecoder(source) {
  return createPasswordDecoder(source, "hwpx_password", "HwpxPasswordAbiUnavailable");
}
