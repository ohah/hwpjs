/** Native size/emphasis with system fonts; not original font or page shaping. */
import { underlineStyle } from "./underline-style.mjs";
import { strikeStyle } from "./strike-style.mjs";
import { createCharacterFontDisplay } from "./character-font-display.mjs";
import { projectDraftAnchoredObjects } from "./anchored-object-draft.mjs";
import { characterScriptStyle } from "./character-script-style.mjs";
import { characterReliefStyle } from "./character-relief-style.mjs";
import { automaticNumberSource, storedAutomaticNumberText } from "./automatic-number-text.mjs";
import { characterOutlineStyle } from "./character-outline-style.mjs";
export function withDraftText(paragraph, text) {
  const numbers = paragraph.automaticNumbers;
  const dutmal = paragraph.dutmal ? projectDraftAnchoredObjects({ paragraphs: [paragraph] }, paragraph.dutmal.map(row => ({ ...row, section: paragraph.section, paragraph: paragraph.paragraph, anchorUnit: row.unit, state: "located" })), { section: paragraph.section, paragraph: paragraph.paragraph, text }).map(({ anchorUnit, state, section, paragraph: ordinal, ...row }) => ({ ...row, unit: anchorUnit })) : undefined;
  const automaticNumbers = numbers ? projectDraftAnchoredObjects({ paragraphs: [paragraph] }, numbers.map(number => ({ ...number, section: paragraph.section, paragraph: paragraph.paragraph, anchorUnit: number.unit, state: "located" })), { section: paragraph.section, paragraph: paragraph.paragraph, text }).map(({ anchorUnit, state, section, paragraph: ordinal, ...number }) => ({ ...number, unit: anchorUnit })) : undefined;
  return { ...paragraph, text, characterRanges: text === paragraph.text ? paragraph.characterRanges : null, ...(numbers ? { automaticNumbers } : {}), ...(dutmal ? { dutmal } : {}) };
}

export function createTextStyle(content, baseFont) {
  const documentFont = createCharacterFontDisplay(content);
  const shapes = new Map((content.characterShapes ?? []).map(shape => [shape.id, shape]));
  const colors = new Map((content.characterTextColors ?? []).map(row => [row.id, row.color]));
  const shades = new Map((content.characterShades ?? []).map(row => [row.id, row]));
  const effects = new Map((content.characterEffects ?? []).map(row => [row.id, row]));
  const outlines = new Map((content.characterOutlines ?? []).map(row => [row.id, row]));
  const underlines = new Map((content.characterUnderlines ?? []).map(row => [row.id, row.kind]));
  const underlineStyles = new Map((content.characterUnderlineStyles ?? []).map(row => [row.id, row]));
  const strikes = new Map((content.characterStrikes ?? []).map(row => [row.id, row.enabled]));
  const strikeStyles = new Map((content.characterStrikeStyles ?? []).map(row => [row.id, row]));
  const shapeAt = (paragraph, unit, kind) => {
    if (kind !== "text" && kind !== "number-prefix") return null;
    const ranges = paragraph?.characterRanges ?? [];
    // Native/HCR1 guarantees sorted contiguous ranges. Empty provenance
    // sites can share a boundary, so choose the last start <= unit.
    let low = 0, high = ranges.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (ranges[middle].start <= unit) low = middle + 1;
      else high = middle;
    }
    const candidate = ranges[low - 1];
    const range = candidate && (unit < candidate.end || paragraph?.text === "" && unit === 0 && candidate.start === 0 && candidate.end === 0) ? candidate : null;
    return range?.charShapeId === null ? null : shapes.get(range?.charShapeId);
  };
  const points = shape => Number.isInteger(shape?.height) && shape.height > 0 ? shape.height / 100 : null;
  const baseResolve = (paragraph, unit, kind = "text") => {
    const shape = shapeAt(paragraph, unit, kind), size = points(shape);
    let font = size === null ? baseFont : baseFont.replace(/\d+(?:\.\d+)?px/, `${size}pt`);
    const family = kind === "text" || kind === "number-prefix" ? documentFont(shape?.id, paragraph?.text, unit) : null;
    if (family) font = font.replace(/(\d+(?:\.\d+)?(?:px|pt)\s+)/, (_, prefix) => `${prefix}${family}, `);
    return `${shape?.italic ? "italic " : ""}${shape?.bold ? "bold " : ""}${font}`;
  };
  const script = (paragraph, unit, kind = "text") => {
    const source = automaticNumberSource(paragraph, unit, kind);
    if (source && storedAutomaticNumberText(source) !== null) return characterScriptStyle({ superscript: source.format.supscript, subscript: false }, baseResolve(paragraph, unit, kind));
    return kind !== "text" || paragraph?.text?.[unit] === "\ufffc" ? null : characterScriptStyle(effects.get(shapeAt(paragraph, unit, kind)?.id), baseResolve(paragraph, unit, kind));
  };
  const resolve = (paragraph, unit, kind = "text") => script(paragraph, unit, kind)?.font ?? baseResolve(paragraph, unit, kind);
  resolve.script = script;
  resolve.relief = (paragraph, unit, kind = "text") => kind !== "text" || paragraph?.text?.[unit] === "\ufffc" ? null : characterReliefStyle(effects.get(shapeAt(paragraph, unit, kind)?.id), resolve(paragraph, unit, kind));
  resolve.outlineStyle = (paragraph, unit, kind = "text") => kind !== "text" || paragraph?.text?.[unit] === "\ufffc" ? null : characterOutlineStyle(outlines.get(shapeAt(paragraph, unit, kind)?.id), resolve(paragraph, unit, kind));
  resolve.outline = (paragraph, unit, kind = "text") => resolve.outlineStyle(paragraph, unit, kind)?.kind ?? null;
  resolve.fontHeight = (paragraph, unit, kind = "text") => {
    const size = points(shapeAt(paragraph, unit, kind));
    return size === null ? 20 : paragraph?.drawingText || paragraph?.tableCell ? size * (96 / 72) : Math.max(20, size * (96 / 72) * 1.25);
  };
  resolve.textHeight = (paragraph, unit, kind = "text") => resolve.fontHeight(paragraph, unit, kind) + (kind === "text" && resolve.underline(paragraph, unit)?.kind === "bottom" ? 9 : 0);
  resolve.color = (paragraph, unit, kind = "text") => {
    const color = colors.get(shapeAt(paragraph, unit, kind)?.id);
    return Number.isInteger(color) && color >= 0 && color <= 0xffffff
      ? `#${color.toString(16).padStart(6, "0")}` : null;
  };
  resolve.underline = (paragraph, unit) => {
    const id = shapeAt(paragraph, unit, "text")?.id;
    return underlineStyle(underlines.get(id), underlineStyles.get(id));
  };
  resolve.shade = (paragraph, unit, kind = "text") => {
    const shade = shades.get(shapeAt(paragraph, unit, kind)?.id);
    return shade?.state === "color" && Number.isInteger(shade.color) && shade.color >= 0 && shade.color <= 0xffffff ? `#${shade.color.toString(16).padStart(6, "0")}` : null;
  };
  resolve.strike = (paragraph, unit) => {
    const id = shapeAt(paragraph, unit, "text")?.id;
    return strikeStyle(strikes.get(id), strikeStyles.get(id));
  };
  return resolve;
}
