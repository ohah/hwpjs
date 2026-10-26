import { characterRangeValues } from "./character-range-values.mjs";

/** Current display ranges only; missing values never become white or none. */
export function characterShadeRangesState(content, ranges) {
  if (!Array.isArray(content?.characterShades)) return null;
  const shades = new Map(content.characterShades.map((row) => [row.id, row]));
  const values = characterRangeValues(content, ranges, (id) => {
    const row = shades.get(id);
    return row?.state === "none" && row.color === null
      ? "none"
      : row?.state === "color" &&
          Number.isInteger(row.color) &&
          row.color >= 0 &&
          row.color <= 0xffffff
        ? `#${row.color.toString(16).padStart(6, "0")}`
        : null;
  });
  return values === null
    ? null
    : values.every((value) => value === values[0])
      ? values[0]
      : "mixed";
}
