/** HWP5 table 25 uses zero-based lines; XML uses explicit shape names. */
import { parseCharacterColor } from "../../js/character-color-args.mjs";
const rawShapes = ["SOLID", "DASH", "DOT", "DASH_DOT", "DASH_DOT_DOT", "LONG_DASH", "CIRCLE", "DOUBLE_SLIM", "SLIM_THICK", "THICK_SLIM", "SLIM_THICK_SLIM", "WAVE", "DOUBLEWAVE"];
export function underlineStyle(kind, row) {
  if (!["bottom", "center", "top"].includes(kind) || !row) return null;
  const shape = row.raw_style === null ? row.shape : rawShapes[row.raw_style];
  if (!rawShapes.includes(shape)) return null;
  let color = row.color;
  if (row.raw_style !== null) {
    const raw = row.raw_color;
    if (!Number.isInteger(raw) || raw < 0 || raw > 0xffffff) return null;
    color = `#${[raw & 255, (raw >>> 8) & 255, (raw >>> 16) & 255].map(value => value.toString(16).padStart(2, "0")).join("")}`;
  }
  if (parseCharacterColor(color) === null) return null;
  return { kind, shape, color };
}
