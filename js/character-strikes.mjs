import { decodeCharacterSnapshot } from "./character-snapshot-json.mjs";
export function decodeCharacterStrikes(bytes) {
  const rows = decodeCharacterSnapshot(bytes, ["id", "enabled"], "InvalidCharacterStrikes");
  for (const row of rows)
    if (row.enabled !== null && typeof row.enabled !== "boolean")
      throw new Error("InvalidCharacterStrikes");
  return rows;
}
