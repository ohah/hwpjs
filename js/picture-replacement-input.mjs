const typed = Object.getPrototypeOf(Uint8Array.prototype);
const tag = Object.getOwnPropertyDescriptor(typed, Symbol.toStringTag).get;
const lengthOf = Object.getOwnPropertyDescriptor(typed, 'byteLength').get;
const offsetOf = Object.getOwnPropertyDescriptor(typed, 'byteOffset').get;
const bufferOf = Object.getOwnPropertyDescriptor(typed, 'buffer').get;
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;

export const PICTURE_REPLACEMENT_LIMITS = Object.freeze({
  documentBytes: 64 * 1024 * 1024,
  imageBytes: 8 * 1024 * 1024,
  wasmBytes: 32 * 1024 * 1024,
  outputBytes: 64 * 1024 * 1024,
});

// Built-in getters avoid caller-provided byteLength, iterator and species hooks.
export function copyPictureInput(value, limit, name) {
  let length,
    buffer,
    offset = 0;
  try {
    if (ArrayBuffer.isView(value) && tag.call(value) === 'Uint8Array') {
      length = lengthOf.call(value);
      offset = offsetOf.call(value);
      buffer = bufferOf.call(value);
      bufferLength.call(buffer); // Shared and detached buffers are not accepted.
    } else {
      length = bufferLength.call(value);
      buffer = value;
    }
  } catch {
    throw new TypeError(`Invalid${name}Bytes`);
  }
  if (length < 1 || length > limit) throw new RangeError(`${name}ByteLimitExceeded`);
  const result = new Uint8Array(length);
  result.set(new Uint8Array(buffer, offset, length));
  return result;
}
