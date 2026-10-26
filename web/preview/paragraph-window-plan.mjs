// Display-only ordinal closure. Native adapters own dependency discovery.
export function planParagraphWindow({ total, offset, count, groups, maxParagraphs }) {
  for (const value of [total, offset, count, maxParagraphs]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("InvalidParagraphWindow");
  }
  if (offset > total || count > total - offset || !Array.isArray(groups))
    throw new RangeError("InvalidParagraphWindow");
  for (const group of groups) {
    if (!Array.isArray(group) || group.length === 0)
      throw new RangeError("InvalidParagraphDependencies");
    const seen = new Set();
    for (const ordinal of group) {
      if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= total || seen.has(ordinal))
        throw new RangeError("InvalidParagraphDependencies");
      seen.add(ordinal);
    }
  }
  let start = offset,
    end = offset + count;
  if (count > maxParagraphs) throw new RangeError("ParagraphWindowBudgetExceeded");
  if (count === 0) return { paragraphOffset: start, maxParagraphs: 0 };
  let changed;
  do {
    changed = false;
    for (const group of groups) {
      if (!group.some((ordinal) => ordinal >= start && ordinal < end)) continue;
      for (const ordinal of group) {
        if (ordinal < start) {
          start = ordinal;
          changed = true;
        }
        if (ordinal >= end) {
          end = ordinal + 1;
          changed = true;
        }
      }
      if (end - start > maxParagraphs) throw new RangeError("ParagraphWindowBudgetExceeded");
    }
  } while (changed);
  return { paragraphOffset: start, maxParagraphs: end - start };
}
