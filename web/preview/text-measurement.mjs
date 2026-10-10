import { DEFAULT_TEXT_HEIGHT } from "./row-geometry.mjs";
import { automaticNumberText } from "./automatic-number-text.mjs";
import { isStructuralAnchor } from "./structural-anchor-units.mjs";

// Prototype display policy; source tab stops and shaping remain separate gates.
export const displayRunText = (text, paragraph, unit, kind, pageNumber = paragraph?.displayPageNumber) => {
  if (text === "\ufffc" && kind === "text") {
    if (isStructuralAnchor(paragraph, unit) || paragraph?.pageControls?.some(control => control.unit === unit && control.paragraph === paragraph.paragraph && control.section === paragraph.section)) return "";
    const number = automaticNumberText(paragraph, unit, pageNumber);
    if (number !== null) return number;
  }
  return text.replaceAll("\t", "    ").replaceAll("\ufffc", "◇").replaceAll("\r", "").replaceAll("\n", "");
};
export function textMeasurement(value) {
  const width = typeof value === "number" ? value : value?.width;
  const height = typeof value === "number" ? DEFAULT_TEXT_HEIGHT : value?.height;
  if (!Number.isFinite(width) || width < 0 || !Number.isFinite(height) || height <= 0) throw new RangeError("InvalidTextMeasurement");
  return { width, height };
}

export function measureDisplayRun(text, paragraph, unit, kind, measure) {
  const display = displayRunText(text, paragraph, unit, kind);
  const measured = textMeasurement(measure(display, paragraph, unit, kind));
  return text === "\ufffc" && display === "" ? { ...measured, width: 0 } : measured;
}
