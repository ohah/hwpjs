import { decodeCharacterSnapshot } from "./character-snapshot-json.mjs";
export function decodeCharacterShades(bytes) {
  const rows = decodeCharacterSnapshot(bytes, ["id", "state", "color"], "InvalidCharacterShades");
  for (const row of rows) {
    if (
      !["absent", "none", "color", "unknown"].includes(row.state) ||
      (row.state === "color"
        ? !Number.isInteger(row.color) || row.color < 0 || row.color > 0xffffff
        : row.color !== null)
    )
      throw new Error("InvalidCharacterShades");
  }
  return rows;
}
