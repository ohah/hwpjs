import { DEFAULT_ROW_HEIGHT, DEFAULT_TEXT_HEIGHT, TEXT_TOP } from "./row-geometry.mjs";
import { paragraphLineGeometry, paragraphLineAdvance } from "./paragraph-geometry.mjs";
import { measureDisplayRun, textMeasurement } from "./text-measurement.mjs";
import { measureAutomaticNumberPrefix } from "./automatic-number-prefix.mjs";
import { isHardLineBreak } from "./hard-line-break.mjs";
import { alignTextRow } from "./line-alignment.mjs";

/** One measured line from a source UTF-16 boundary, independent of page state. */
export function nextTextRow(paragraph, startUnit, width, measure, { minimumTextHeight = DEFAULT_TEXT_HEIGHT, endUnit = paragraph.text.length } = {}) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isInteger(startUnit) || startUnit < 0 || startUnit > paragraph.text.length) throw new RangeError("InvalidLayoutBounds");
  const segments = new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(paragraph.text);
  if (!Number.isInteger(endUnit) || endUnit < startUnit || endUnit > paragraph.text.length) throw new RangeError("InvalidLayoutBounds");
  if (startUnit < paragraph.text.length && segments.containing(startUnit)?.index !== startUnit) throw new RangeError("InvalidTextBoundary");
  if (endUnit < paragraph.text.length && segments.containing(endUnit)?.index !== endUnit) throw new RangeError("InvalidTextBoundary");
  const numberPrefix = measureAutomaticNumberPrefix(paragraph, startUnit, measure);
  if (!Number.isFinite(minimumTextHeight) || minimumTextHeight < 0) throw new RangeError("InvalidLayoutBounds");
  const emptyHeight = minimumTextHeight === 0 ? textMeasurement(measure("", paragraph, startUnit, "text")).height : minimumTextHeight;
  let text = "", size = numberPrefix?.width ?? 0, textHeight = Math.max(emptyHeight, numberPrefix?.height ?? 0);
  const boundaries = [{ unit: startUnit, x: size }];
  for (const part of segments) {
    if (part.index < startUnit) continue;
    if (part.index >= endUnit) break;
    if (isHardLineBreak(part.segment)) {
      textHeight = Math.max(textHeight, textMeasurement(measure("", paragraph, part.index, "text")).height);
      text += part.segment;
      boundaries.push({ unit: part.index + part.segment.length, x: size });
      break;
    }
    const measurement = measureDisplayRun(part.segment, paragraph, part.index, "text", measure);
    const geometry = paragraphLineGeometry(paragraph.paragraphShape, width, size, startUnit === 0);
    if (text && size + measurement.width > geometry.width) break;
    text += part.segment; size += measurement.width; textHeight = Math.max(textHeight, measurement.height);
    boundaries.push({ unit: part.index + part.segment.length, x: size });
  }
  const geometry = paragraphLineGeometry(paragraph.paragraphShape, width, size, startUnit === 0);
  return alignTextRow({ kind: "text", section: paragraph.section, paragraph: paragraph.paragraph, text, startUnit, endUnit: startUnit + text.length, boundaries, textHeight,
    height: paragraphLineAdvance(paragraph.paragraphShape, textHeight, Math.max(DEFAULT_ROW_HEIGHT, textHeight + TEXT_TOP)),
    paragraphShape: paragraph.paragraphShape, paragraphX: geometry.x, width: geometry.width, ...(numberPrefix ? { numberPrefix } : {}),
    editable: paragraph.editable, selectable: !paragraph.clipped && (paragraph.editable || paragraph.selectable) }, { lastLine: startUnit + text.length === paragraph.text.length });
}
