import { validFontFaceOrder } from "./font-face-identity.mjs";
export { FONT_LANGUAGES } from "./font-face-identity.mjs";

export function decodeFontFaces(bytes) {
  const fail = () => { throw new Error("InvalidFontFaces"); };
  if (!(bytes instanceof Uint8Array)) return fail();
  let rows;
  try { rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return fail(); }
  if (!Array.isArray(rows) || rows.length > 1000000) return fail();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length !== 3 || !["language", "id", "name"].every(key => Object.hasOwn(row, key))) return fail();
    if (row.name !== null && (typeof row.name !== "string" || !row.name.isWellFormed() || new TextEncoder().encode(row.name).length > 4096)) return fail();
  }
  if (!validFontFaceOrder(rows)) return fail();
  return rows;
}
