import { layoutContent } from "./layout.mjs";
import { textMeasurement } from "./text-measurement.mjs";
import { paragraphLineAdvance } from "./paragraph-geometry.mjs";
import { DEFAULT_ROW_HEIGHT, TEXT_TOP } from "./row-geometry.mjs";
import { inlineObjectIdentity } from "./inline-object-identity.mjs";

// 현재 UTF-16 위치와 주입된 인라인 개체 크기를 측정합니다.
export function measureInlineObjectParagraph(paragraph, entries, width, measure, { maxRows = 20000, allowLineOverflow = false, compactLines = false, zeroWidthUnits = [], textAnchorUnits = [] } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!paragraph || typeof paragraph.text !== "string" || !Array.isArray(entries) || !entries.length || typeof measure !== "function" || !Number.isFinite(width) || width <= 0 || !Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("InvalidInlineObjectMeasurement");
  const units = [];
  for (let unit = 0; unit < paragraph.text.length; unit++) if (paragraph.text[unit] === "\ufffc") units.push(unit);
  const objectUnits = new Set(units);
  if (!Array.isArray(zeroWidthUnits) || !zeroWidthUnits.every(unit => Number.isSafeInteger(unit) && objectUnits.has(unit))
    || new Set(zeroWidthUnits).size !== zeroWidthUnits.length) return unavailable("InvalidInlineObjectAnchorPosition");
  const overlays = new Set(zeroWidthUnits);
  if (!Array.isArray(textAnchorUnits) || !textAnchorUnits.every(unit => Number.isSafeInteger(unit) && objectUnits.has(unit) && !overlays.has(unit))
    || new Set(textAnchorUnits).size !== textAnchorUnits.length) return unavailable("InvalidInlineObjectAnchorPosition");
  const textAnchors = new Set(textAnchorUnits);
  if (units.length !== entries.length + overlays.size + textAnchors.size) return unavailable("AmbiguousInlineObjectAnchors");
  for (const part of new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(paragraph.text)) {
    if (part.segment.includes("\ufffc") && part.segment.length !== 1) return unavailable("UnsupportedInlineObjectGrapheme");
  }
  const byUnit = new Map(), ids = new Set(), unitSet = new Set(units.filter(unit => !overlays.has(unit) && !textAnchors.has(unit)));
  const inlineUnits = [...unitSet];
  const explicit = entries.some(entry => entry && Object.hasOwn(entry, "unit"));
  for (const [index, entry] of entries.entries()) {
    const identity = inlineObjectIdentity(entry);
    if (identity === null || ids.has(identity) || ![entry.width, entry.height].every(value => Number.isFinite(value) && value > 0)) return unavailable("InvalidInlineObjectMeasurement");
    const unit = explicit ? entry.unit : inlineUnits[index];
    if (!Number.isSafeInteger(unit) || !unitSet.has(unit) || byUnit.has(unit)) return unavailable("InvalidInlineObjectAnchorPosition");
    ids.add(identity); byUnit.set(unit, entry);
  }
  const currentMeasure = (text, current, unit, kind) => kind === "text" && text !== "" && overlays.has(unit)
    ? { ...textMeasurement(measure("", current, unit, kind)), width: 0 } : measure(text, current, unit, kind);
  const flow = layoutContent({ paragraphs: [{ ...paragraph, label: paragraph.label ?? "" }], limited: false }, width,
    (text, current, unit, kind) => kind === "text" && text !== "" && byUnit.has(unit) ? { width: byUnit.get(unit).width, height: byUnit.get(unit).height } : currentMeasure(text, current, unit, kind), maxRows, { documentBody: true, compactLines });
  if (flow.limited) return unavailable("InlineObjectMeasurementLimit");
  let y = 0;
  const anchorUnits = [...byUnit.keys()];
  const rows = flow.rows.map(row => {
    let current = { ...row, y };
    if (row.kind === "text" && anchorUnits.some(unit => row.startUnit <= unit && row.endUnit > unit)) {
      let glyphHeight = textMeasurement(measure("", paragraph, row.startUnit, "text")).height;
      for (const part of new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(row.text)) {
        const unit = row.startUnit + part.index;
        if (!byUnit.has(unit)) glyphHeight = Math.max(glyphHeight, textMeasurement(currentMeasure(part.segment, paragraph, unit, "text")).height);
      }
      const minimum = compactLines ? glyphHeight : Math.max(DEFAULT_ROW_HEIGHT, glyphHeight + TEXT_TOP);
      const pitch = compactLines && row === flow.rows.at(-1) ? glyphHeight : paragraphLineAdvance(paragraph.paragraphShape, glyphHeight, minimum);
      current = { ...current, textHeight: glyphHeight, height: Math.max(row.textHeight, pitch) };
    }
    y += current.height; return current;
  });
  const anchors = [];
  for (const [unit, entry] of byUnit) {
    const rowIndex = rows.findIndex(row => row.kind === "text" && row.startUnit <= unit && row.endUnit > unit);
    const row = rows[rowIndex], boundary = row?.boundaries.find(boundary => boundary.unit === unit);
    if (!row || !boundary || (!allowLineOverflow && entry.width > row.width + 1e-8)) return unavailable("InlineObjectLineWidthOverflow");
    anchors.push({ ...(Object.hasOwn(entry, "createdTableIdentity") ? { createdTableIdentity: entry.createdTableIdentity } : { objectNode: entry.objectNode }), unit, rowIndex, x: row.paragraphX + boundary.x, y: row.y, width: entry.width, height: entry.height });
  }
  return { state: "measured", ...flow, rows, height: y, anchors };
}
