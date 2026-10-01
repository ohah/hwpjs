const segments = new Intl.Segmenter("ko", { granularity: "grapheme" });
const splitScalar = (text, unit) => unit > 0 && unit < text.length && /[\uD800-\uDBFF]/u.test(text[unit - 1]) && /[\uDC00-\uDFFF]/u.test(text[unit]);

/** Minimal UTF-16 replacement; do not cut a shared surrogate in half. */
export function textChange(before, after) {
  if (before === after) return null;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  while (splitScalar(before, start) || splitScalar(after, start)) start--;
  let oldEnd = before.length, newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  if (splitScalar(before, oldEnd) || splitScalar(after, newEnd)) { oldEnd++; newEnd++; }
  return { startUnit: start, endUnit: oldEnd, text: after.slice(start, newEnd) };
}
export function graphemeUnits(text) {
  return [...segments.segment(text)].map(s => s.index).concat(text.length);
}
export function snapUnit(text, unit, forward = false) {
  const bounds = graphemeUnits(text);
  return forward ? bounds.find(b => b >= unit) ?? text.length : bounds.filter(b => b <= unit).at(-1) ?? 0;
}
