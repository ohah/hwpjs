import { uint, observationSpans } from './observation-structure.mjs';
import { snapUnit } from './text-input.mjs';

const graphemeBoundary = (text, unit, end = false) => snapUnit(text, unit, end) === unit;
/** Shared display coverage. Default web policy stays grapheme-safe; explicit callers may supply scalar boundaries. */
export function characterRangeValues(
  content,
  ranges,
  valueAt,
  { isBoundary = graphemeBoundary } = {},
) {
  if (
    !Array.isArray(content?.paragraphs) ||
    content.paragraphs.some((row) => !row || typeof row !== 'object') ||
    !Array.isArray(ranges) ||
    !ranges.length
  )
    return null;
  const values = [];
  for (const range of ranges) {
    if (!range) return null;
    const paragraph = content.paragraphs.find(
      (row) => row.section === range.section && row.paragraph === range.paragraph,
    );
    const { startUnit: start, endUnit: end } = range;
    if (
      !paragraph ||
      paragraph.clipped ||
      typeof paragraph.text !== 'string' ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      start > end ||
      end > paragraph.text.length ||
      !isBoundary(paragraph.text, start) ||
      !isBoundary(paragraph.text, end, true)
    )
      return null;
    const spans = observationSpans(paragraph);
    if (!spans) return null;
    let cursor = start;
    for (const span of spans) {
      if (
        !span ||
        !Number.isInteger(span.start) ||
        !Number.isInteger(span.end) ||
        span.start < 0 ||
        span.start > span.end ||
        span.end > paragraph.text.length ||
        !isBoundary(paragraph.text, span.start) ||
        !isBoundary(paragraph.text, span.end, true)
      )
        return null;
      const low = Math.max(start, span.start),
        high = Math.min(end, span.end);
      if (low >= high) continue;
      if (!uint(span.charShapeId)) return null;
      const value = valueAt(span.charShapeId);
      if (low !== cursor || value === null || value === undefined) return null;
      values.push(value);
      cursor = high;
    }
    if (cursor !== end) return null;
  }
  return values.length ? values : null;
}
