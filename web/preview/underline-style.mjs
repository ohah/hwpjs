/** HWP5 table 25 uses zero-based lines; XML uses explicit shape names. */
import { parseCharacterColor } from "../../js/character-color-args.mjs";
import { colorrefCss } from "./colorref-css.mjs";
const rawShapes = [
  "SOLID",
  "DASH",
  "DOT",
  "DASH_DOT",
  "DASH_DOT_DOT",
  "LONG_DASH",
  "CIRCLE",
  "DOUBLE_SLIM",
  "SLIM_THICK",
  "THICK_SLIM",
  "SLIM_THICK_SLIM",
  "WAVE",
  "DOUBLEWAVE",
];
export function underlineStyle(kind, row) {
  if (!["bottom", "center", "top"].includes(kind) || !row) return null;
  const shape = row.raw_style === null ? row.shape : rawShapes[row.raw_style];
  if (!rawShapes.includes(shape)) return null;
  let color = row.color;
  if (row.raw_style !== null) {
    const raw = row.raw_color;
    color = colorrefCss(raw);
  }
  if (parseCharacterColor(color) === null) return null;
  return { kind, shape, color };
}
