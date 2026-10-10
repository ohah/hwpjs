/** Derive a toggle from the current native display projection, never cached UI state. */
export function characterSelectionState(content, paragraph, start, end, property) {
  const underline = property === "underline";
  const strike = property === "strike";
  if (typeof paragraph?.text !== "string" || (strike ? content?.characterStrikeAvailable : underline ? content?.characterUnderlineAvailable : content?.characterPropertiesAvailable) !== true || !["bold", "italic", "underline", "strike"].includes(property) || paragraph?.clipped ||
      !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end || end > paragraph?.text?.length) return null;
  const shapes = new Map((content.characterShapes ?? []).map(shape => [shape.id, shape]));
  const underlines = underline ? new Map((content.characterUnderlines ?? []).map(row => [row.id, row.kind])) : null;
  const strikes = strike ? new Map((content.characterStrikes ?? []).map(row => [row.id, row.enabled])) : null;
  let cursor = start, allEnabled = true, anyEnabled = false;
  for (const span of paragraph.characterRanges ?? []) {
    const low = Math.max(start, span.start), high = Math.min(end, span.end);
    if (low >= high) continue;
    const shape = shapes.get(span.charShapeId);
    const kind = underlines?.get(span.charShapeId);
    const enabled = strike ? strikes.get(span.charShapeId) : underline ? (["none", "bottom", "center", "top"].includes(kind) ? kind !== "none" : null) : shape?.[property];
    if (low !== cursor || typeof enabled !== "boolean") return null;
    allEnabled &&= enabled;
    anyEnabled ||= enabled;
    cursor = high;
  }
  return cursor === end ? (allEnabled ? true : anyEnabled ? "mixed" : false) : null;
}

export function characterTogglePatch(content, paragraph, start, end, property) {
  const state = characterSelectionState(content, paragraph, start, end, property);
  return state === null ? null : { [property]: state !== true };
}

export function characterRangesState(content, ranges, property) {
  if (!ranges?.length) return null;
  const states = ranges.map(range => characterSelectionState(content, content.paragraphs.find(row => row.section === range.section && row.paragraph === range.paragraph), range.startUnit, range.endUnit, property));
  if (states.some(state => state === null)) return null;
  if (states.every(state => state === true)) return true;
  return states.every(state => state === false) ? false : "mixed";
}
