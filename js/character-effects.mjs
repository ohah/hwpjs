import { decodeCharacterSnapshot } from "./character-snapshot-json.mjs";
import { CHARACTER_EFFECTS } from "./character-effect-args.mjs";
export function decodeCharacterEffects(bytes) {
  const flags = CHARACTER_EFFECTS;
  const rows = decodeCharacterSnapshot(bytes, ["id", ...flags], "InvalidCharacterEffects");
  if (rows.some((row) => flags.some((flag) => typeof row[flag] !== "boolean")))
    throw new Error("InvalidCharacterEffects");
  return rows;
}
