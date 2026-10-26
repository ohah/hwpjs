import { decodeCharacterSnapshot } from "./character-snapshot-json.mjs";
export function decodeCharacterUnderlineStyles(bytes) {
  const rows = decodeCharacterSnapshot(
    bytes,
    ["id", "raw_style", "raw_color", "shape", "color"],
    "InvalidCharacterUnderlineStyles",
  );
  const text = (value) =>
    value === null || (typeof value === "string" && new TextEncoder().encode(value).length <= 4096);
  for (const row of rows) {
    const raw = row.raw_style !== null;
    if (
      (raw &&
        (!Number.isInteger(row.raw_style) ||
          row.raw_style < 0 ||
          row.raw_style > 15 ||
          !Number.isInteger(row.raw_color) ||
          row.raw_color < 0 ||
          row.raw_color > 0xffffffff ||
          row.shape !== null ||
          row.color !== null)) ||
      (!raw && (row.raw_color !== null || !text(row.shape) || !text(row.color)))
    )
      throw new Error("InvalidCharacterUnderlineStyles");
  }
  return rows;
}
