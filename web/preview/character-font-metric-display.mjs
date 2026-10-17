/** Glyph size policy; nominal row metrics remain independent. */
import { displayFontLanguage } from "./character-font-display.mjs";
import { usesDocumentFontMetrics } from "./font-layout-policy.mjs";
export function createRelativeFontSize(content) {
  const values = new Map((content.characterFontMetrics ?? []).map(row => [row.id, row.values]));
  return (id, text, unit, points) => {
    if (!usesDocumentFontMetrics(content.format) || typeof text !== "string" || !Number.isInteger(unit) || unit < 0 || unit >= text.length || text[unit] === "\ufffc") return points;
    const relative = values.get(id)?.relativeSize?.[displayFontLanguage(String.fromCodePoint(text.codePointAt(unit)))];
    // Missing data and values outside the documented 10..250 range do not
    // become a fabricated 0pt size. The raw API keeps those values unchanged.
    return Number.isInteger(relative) && relative >= 10 && relative <= 250 ? points * relative / 100 : points;
  };
}
