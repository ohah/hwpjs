import { textChange } from './text-input.mjs';

const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const splitsScalar = (text, unit) => unit > 0 && unit < text.length && /[\uD800-\uDBFF]/u.test(text[unit - 1]) && /[\uDC00-\uDFFF]/u.test(text[unit]);

/** Display-only ranges. Native replies, source bindings and save remain authoritative.
 * Preserve the plain splice's first inclusive source site (left affinity),
 * including an explicit empty source site. Never substitute style zero.
 */
export function projectTypingDraftRanges(paragraph, text, selection = null) {
  const before = paragraph?.text, ranges = paragraph?.characterRanges;
  if (typeof before !== 'string' || typeof text !== 'string' || !before.isWellFormed() || !text.isWellFormed() || !Array.isArray(ranges) || paragraph.clipped) return null;
  let cursor = 0;
  for (const range of ranges) {
    if (!uint(range?.start) || !uint(range.end) || !uint(range.charShapeId) || range.start !== cursor || range.end < range.start || range.end > before.length || splitsScalar(before, range.start) || splitsScalar(before, range.end)) return null;
    cursor = range.end;
  }
  if (cursor !== before.length || !ranges.length) return null;
  if (before === text) return ranges.map(range => ({ ...range }));
  const change = textChange(before, text, selection);
  if (!change) return null;
  const { startUnit: start, endUnit: end } = change;
  const site = ranges.find(range => range.start <= start && start <= range.end);
  if (!site) return null;
  const delta = change.text.length - (end - start), output = [];
  const append = (low, high, id) => {
    const previous = output.at(-1);
    if (high > low && previous?.end === low && previous.start < previous.end && previous.charShapeId === id) previous.end = high;
    else output.push({ start: low, end: high, charShapeId: id });
  };
  for (const range of ranges) {
    if (range.start < start) append(range.start, Math.min(range.end, start), range.charShapeId);
  }
  if (change.text.length) append(start, start + change.text.length, site.charShapeId);
  for (const range of ranges) {
    if (range.end > end) append(Math.max(range.start, end) + delta, range.end + delta, range.charShapeId);
    else if (range.start === range.end && range.start >= end) append(range.start + delta, range.end + delta, range.charShapeId);
  }
  if (!output.length && !text.length) append(0, 0, site.charShapeId);
  return output;
}
