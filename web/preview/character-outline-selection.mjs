import { characterRangeValues } from "./character-range-values.mjs";
import { HWP5_CHARACTER_OUTLINE_KINDS } from "../../js/character-outline-args.mjs";
function outlineValues(content, ranges, read) {
  if (!Array.isArray(content?.characterOutlines)) return null;
  const rows = new Map();
  for (const row of content.characterOutlines) {
    if (!row || !Number.isInteger(row.id) || row.id < 0 || row.id > 0xffffffff || rows.has(row.id))
      return null;
    rows.set(row.id, row);
  }
  const values = characterRangeValues(content, ranges, (id) => read(rows.get(id)));
  return values === null
    ? null
    : values.every((value) => value === values[0])
      ? values[0]
      : "mixed";
}
export function characterOutlineRangesState(content, ranges) {
  return outlineValues(content, ranges, (row) =>
    ["absent", "none", "solid", "other"].includes(row?.state) ? row.state : null,
  );
}
export function characterOutlineRangesKind(content, ranges) {
  return outlineValues(content, ranges, (row) => {
    if (!row) return null;
    if (row.rawKind === null)
      return ["absent", "none", "solid"].includes(row.state) ? row.state : null;
    if (!Number.isInteger(row.rawKind) || row.rawKind < 0 || row.rawKind > 6) return null;
    const expected = row.rawKind === 0 ? "none" : row.rawKind === 1 ? "solid" : "other";
    return row.state === expected ? HWP5_CHARACTER_OUTLINE_KINDS[row.rawKind] : null;
  });
}
