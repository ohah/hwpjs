import { decodeCharacterSnapshot } from "./character-snapshot-json.mjs";
export function decodeCharacterUnderlines(bytes) {
  const rows = decodeCharacterSnapshot(bytes, ["id", "kind"], "InvalidCharacterUnderlines");
  for (const row of rows) {
    if (![null, "none", "bottom", "center", "top"].includes(row.kind)) throw new Error("InvalidCharacterUnderlines");
  }
  return rows;
}
