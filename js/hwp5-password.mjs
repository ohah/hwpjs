import { createPasswordDecoder } from './password-decoder.mjs';
/** Explicit conversion. Returned CFB no longer has password protection. */
export function createHwp5PasswordDecoder(source) {
  return createPasswordDecoder(source, 'hwp5_password', 'Hwp5PasswordAbiUnavailable');
}
