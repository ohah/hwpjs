import { decodeCharacterSnapshot } from "./character-snapshot-json.mjs";
export function decodeCharacterStrikeStyles(bytes) {
  const rows = decodeCharacterSnapshot(
    bytes,
    ["id", "raw_style", "raw_color", "shape", "color"],
    "InvalidCharacterStrikeStyles",
  );
  const text = (value) =>
    value === null || (typeof value === "string" && new TextEncoder().encode(value).length <= 4096);
  const color = (value) =>
    value === null || (Number.isInteger(value) && value >= 0 && value <= 0xffffffff);
  for (const row of rows) {
    if (
      row.raw_style !== null
        ? !Number.isInteger(row.raw_style) ||
          row.raw_style < 0 ||
          row.raw_style > 15 ||
          !color(row.raw_color) ||
          row.shape !== null ||
          row.color !== null
        : row.raw_color !== null || !text(row.shape) || !text(row.color)
    )
      throw new Error("InvalidCharacterStrikeStyles");
  }
  return rows;
}
