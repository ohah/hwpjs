let segments, words;
function createSegmenter(granularity) {
  const Segmenter = globalThis.Intl?.Segmenter;
  if (typeof Segmenter !== "function") throw Error("IntlSegmenterUnavailable");
  return new Segmenter("ko", { granularity });
}
const splitScalar = (text, unit) => unit > 0 && unit < text.length && /[\uD800-\uDBFF]/u.test(text[unit - 1]) && /[\uDC00-\uDFFF]/u.test(text[unit]);

/** Prefer a verified pre-input selection; otherwise use a minimal scalar-safe replacement. */
export function textChange(before, after, selection = null) {
  if (before === after) return null;
  let first = selection?.startUnit, last = selection?.endUnit;
  if (Number.isInteger(first) && Number.isInteger(last) && first >= 0 && first <= last && last <= before.length) {
    if (first === last && after.length < before.length) {
      const removed = before.length - after.length;
      if (selection.inputType === "deleteContentBackward") first -= removed;
      else if (selection.inputType === "deleteContentForward") last += removed;
    }
    const inserted = after.length - (before.length - (last - first)), end = first + inserted;
    if (first >= 0 && last <= before.length && inserted >= 0 && !splitScalar(before, first) && !splitScalar(before, last) && !splitScalar(after, first) && !splitScalar(after, end)
      && before.slice(0, first) === after.slice(0, first) && before.slice(last) === after.slice(end)) {
      return { startUnit: first, endUnit: last, text: after.slice(first, end) };
    }
  }
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  while (splitScalar(before, start) || splitScalar(after, start)) start--;
  let oldEnd = before.length, newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  if (splitScalar(before, oldEnd) || splitScalar(after, newEnd)) { oldEnd++; newEnd++; }
  return { startUnit: start, endUnit: oldEnd, text: after.slice(start, newEnd) };
}
export function graphemeUnits(text) {
  return [...(segments ??= createSegmenter("grapheme")).segment(text)].map(s => s.index).concat(text.length);
}
/** 공백과 구두점을 건너뛴 단어 시작점으로 이동한다. */
export function wordBoundary(text, unit, forward) {
  let previous = 0;
  for (const part of (words ??= createSegmenter("word")).segment(text)) {
    if (!part.isWordLike) continue;
    if (forward && part.index > unit) return part.index;
    if (!forward && part.index >= unit) break;
    previous = part.index;
  }
  return forward ? text.length : previous;
}
export function snapUnit(text, unit, forward = false) {
  const bounds = graphemeUnits(text);
  return forward ? bounds.find(b => b >= unit) ?? text.length : bounds.filter(b => b <= unit).at(-1) ?? 0;
}
