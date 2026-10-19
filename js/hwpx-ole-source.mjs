import { validateShapeSourceValues } from "./hwpx-shape-source-values.mjs";

const uint = v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
const errors = new Set(["UnsupportedOleDisplayHost", "MissingCurrentParagraphDisplayHost", "AmbiguousParagraphDisplayHost",
  "MissingProtectedDisplayAnchor", "UnsupportedJoinedParagraphLocations", "UnsupportedInlineControl", "UnsupportedTextPositionProjection", "MissingTextSite"]);
function parse(bytes, maxBytes, message) {
  if (!(bytes instanceof Uint8Array) || bytes.length > maxBytes) throw new Error(message);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error(message); }
}
export function decodeOleSites(bytes) {
  const fail = () => { throw new Error("InvalidOleSites"); };
  const value = parse(bytes, 16 * 1024 * 1024, "InvalidOleSites"), seen = new Set();
  if (!Array.isArray(value) || value.length > 100000) fail();
  for (const row of value) {
    if (!row || !uint(row.ole_node) || seen.has(row.ole_node)
      || !(row.paragraph === null || uint(row.paragraph) && row.paragraph > 0)
      || !(row.anchor_unit === null || uint(row.anchor_unit))) fail();
    if (row.error_name === null ? row.paragraph === null || row.anchor_unit === null
      : !errors.has(row.error_name) || row.anchor_unit !== null) fail();
    seen.add(row.ole_node);
  }
  return value;
}
export function decodeOleSource(bytes) {
  const fail = () => { throw new Error("InvalidOleSource"); };
  const value = parse(bytes, 65536, "InvalidOleSource");
  if (!value || !Object.hasOwn(value, "position") || !Object.hasOwn(value, "flow")) fail();
  try { validateShapeSourceValues(value); } catch { fail(); }
  for (const name of ["binary_item_id", "object_type", "draw_aspect"]) {
    const text = value[name];
    if (text !== null && (typeof text !== "string" || !text.isWellFormed() || new TextEncoder().encode(text).length > 4096)) fail();
  }
  if (![null, false, true].includes(value.has_moniker)) fail();
  return value;
}
