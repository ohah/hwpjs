import { validFontFaceOrder } from "./font-face-identity.mjs";

/** Optional v1 display metadata; the existing fontFaces wire stays unchanged. */
export function decodeFontFaceMetadata(bytes) {
  const fail = () => { throw new Error("InvalidFontFaceMetadata"); };
  const keys = (row, names) => row !== null && typeof row === "object" && !Array.isArray(row) && Object.keys(row).length === names.length && names.every(name => Object.hasOwn(row, name));
  const string = value => value === null || typeof value === "string" && value.isWellFormed() && new TextEncoder().encode(value).length <= 4096;
  if (!(bytes instanceof Uint8Array)) return fail();
  let wire;
  try { wire = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return fail(); }
  if (!keys(wire, ["version", "fonts"]) || wire.version !== 1 || !Array.isArray(wire.fonts) || wire.fonts.length > 1000000) return fail();
  for (const row of wire.fonts) {
    if (!keys(row, ["language", "id", "attributes", "substitute", "typeInfo", "defaultName"])) return fail();
    if (!Number.isInteger(row.attributes) || row.attributes < 0 || row.attributes > 255) return fail();
    if (row.attributes & 128) {
      if (!keys(row.substitute, ["kind", "name"]) || !Number.isInteger(row.substitute.kind) || row.substitute.kind < 0 || row.substitute.kind > 255 || !string(row.substitute.name)) return fail();
    } else if (row.substitute !== null) return fail();
    if (row.attributes & 64) {
      if (!Array.isArray(row.typeInfo) || row.typeInfo.length !== 10 || row.typeInfo.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return fail();
    } else if (row.typeInfo !== null) return fail();
    if (!string(row.defaultName) || !(row.attributes & 32) && row.defaultName !== null) return fail();
  }
  if (!validFontFaceOrder(wire.fonts)) return fail();
  return wire.fonts;
}
