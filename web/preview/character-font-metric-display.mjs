/** Glyph size policy; nominal row metrics remain independent. */
import { displayFontLanguage } from "./character-font-display.mjs";
import { usesDocumentFontMetrics } from "./font-layout-policy.mjs";
export function createCharacterFontMetricDisplay(content) {
  const values = new Map((content.characterFontMetrics ?? []).map(row => [row.id, row.values]));
  const value = (field, id, text, unit) => {
    if (!usesDocumentFontMetrics(content.format) || typeof text !== "string" || !Number.isInteger(unit) || unit < 0 || unit >= text.length || text[unit] === "\ufffc") return null;
    return values.get(id)?.[field]?.[displayFontLanguage(String.fromCodePoint(text.codePointAt(unit)))];
  };
  return {
    relativeSize(id, text, unit, points) {
      const relative = value("relativeSize", id, text, unit);
      return Number.isInteger(relative) && relative >= 10 && relative <= 250 ? points * relative / 100 : points;
    },
    horizontalScale(id, text, unit) {
      const ratio = value("ratio", id, text, unit);
      return Number.isInteger(ratio) && ratio >= 50 && ratio <= 200 ? ratio / 100 : 1;
    },
  };
}
export const createRelativeFontSize = content => createCharacterFontMetricDisplay(content).relativeSize;
