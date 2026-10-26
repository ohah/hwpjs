import { validFontFaceOrder } from "./font-face-identity.mjs";
export const metadataKeys = (row, names) =>
  row !== null &&
  typeof row === "object" &&
  !Array.isArray(row) &&
  Object.keys(row).length === names.length &&
  names.every((name) => Object.hasOwn(row, name));
export const metadataText = (value) =>
  value === null ||
  (typeof value === "string" &&
    value.isWellFormed() &&
    new TextEncoder().encode(value).length <= 4096);
export function decodeMetadataWire(bytes, errorName) {
  const fail = () => {
    throw new Error(errorName);
  };
  if (!(bytes instanceof Uint8Array)) return fail();
  let wire;
  try {
    wire = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (
    !metadataKeys(wire, ["version", "fonts"]) ||
    wire.version !== 1 ||
    !Array.isArray(wire.fonts) ||
    wire.fonts.length > 1000000 ||
    !validFontFaceOrder(wire.fonts)
  )
    return fail();
  return wire.fonts;
}
