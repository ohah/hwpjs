import { nodeBuffer } from "./output-bytes.mjs";
// Native brand checks work across realms and do not trust Symbol.toStringTag.
const bufferLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
).get;
const typedArrayName = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  Symbol.toStringTag,
).get;

export function inputBytes(data) {
  if (ArrayBuffer.isView(data) && typedArrayName.call(data) === "Uint8Array")
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let isBuffer = false;
  try {
    bufferLength.call(data);
    isBuffer = true;
  } catch {
    /* Not an ArrayBuffer. */
  }
  if (isBuffer) return new Uint8Array(data);
  if (!Array.isArray(data))
    throw new TypeError(
      "Expected Uint8Array, ArrayBuffer, or an array of bytes",
    );
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < bytes.length; i++) {
    const value = data[i];
    if (!Number.isInteger(value) || value < 0 || value > 255)
      throw new TypeError(`Invalid byte at index ${i}`);
    bytes[i] = value;
  }
  return bytes;
}

export function decodeInput(data, type) {
  if (type === "buffer" || type === "array") return data;
  if (type !== "base64" && type !== "binary")
    throw new TypeError(`Unsupported CFB input type: ${type}`);
  if (typeof data !== "string")
    throw new TypeError(`${type} input must be a string`);
  const binary = type === "base64" ? atob(data) : data;
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    const value = binary.charCodeAt(i);
    if (value > 255) throw new TypeError(`Invalid binary byte at index ${i}`);
    bytes[i] = value;
  }
  return nodeBuffer ? nodeBuffer.from(bytes) : Array.from(bytes);
}
