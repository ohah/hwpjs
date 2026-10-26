import { uint, observationRows, observationSpans } from './observation-structure.mjs';
/** Derive a toggle from the current native display projection, never cached UI state. */
export function characterSelectionState(content, paragraph, start, end, property) {
  const underline = property === 'underline';
  const strike = property === 'strike';
  if (
    typeof paragraph?.text !== 'string' ||
    (strike
      ? content?.characterStrikeAvailable
      : underline
        ? content?.characterUnderlineAvailable
        : content?.characterPropertiesAvailable) !== true ||
    !['bold', 'italic', 'underline', 'strike'].includes(property) ||
    paragraph?.clipped ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start >= end ||
    end > paragraph?.text?.length
  )
    return null;
  const spans = observationSpans(paragraph);
  const shapes = underline || strike ? null : observationRows(content.characterShapes);
  const underlines = underline ? observationRows(content.characterUnderlines) : null;
  const strikes = strike ? observationRows(content.characterStrikes) : null;
  if (!spans || !(strike ? strikes : underline ? underlines : shapes)) return null;
  let cursor = start,
    allEnabled = true,
    anyEnabled = false;
  for (const span of spans) {
    const low = Math.max(start, span.start),
      high = Math.min(end, span.end);
    if (low >= high) continue;
    if (!uint(span.charShapeId)) return null;
    const shape = shapes?.get(span.charShapeId);
    const kind = underlines?.get(span.charShapeId)?.kind;
    const enabled = strike
      ? strikes.get(span.charShapeId)?.enabled
      : underline
        ? ['none', 'bottom', 'center', 'top'].includes(kind)
          ? kind !== 'none'
          : null
        : shape?.[property];
    if (low !== cursor || typeof enabled !== 'boolean') return null;
    allEnabled &&= enabled;
    anyEnabled ||= enabled;
    cursor = high;
  }
  return cursor === end ? (allEnabled ? true : anyEnabled ? 'mixed' : false) : null;
}

export function characterTogglePatch(content, paragraph, start, end, property) {
  const state = characterSelectionState(content, paragraph, start, end, property);
  return state === null ? null : { [property]: state !== true };
}

export function characterRangesState(content, ranges, property) {
  if (
    !Array.isArray(ranges) ||
    !ranges.length ||
    !Array.isArray(content?.paragraphs) ||
    content.paragraphs.some((row) => !row || typeof row !== 'object') ||
    ranges.some((range) => !range)
  )
    return null;
  const states = ranges.map((range) =>
    characterSelectionState(
      content,
      content.paragraphs.find(
        (row) => row.section === range.section && row.paragraph === range.paragraph,
      ),
      range.startUnit,
      range.endUnit,
      property,
    ),
  );
  if (states.some((state) => state === null)) return null;
  if (states.every((state) => state === true)) return true;
  return states.every((state) => state === false) ? false : 'mixed';
}
