// Sparse display identity closure; adapters still validate format ownership.
export function planParagraphDependencies({ total, offset, count, dependencies, maxParagraphs }) {
  if (![total, offset, count, maxParagraphs].every(value => Number.isSafeInteger(value) && value >= 0)
    || offset > total || count > total - offset || !(dependencies instanceof Map)) throw new RangeError("InvalidParagraphWindow");
  const valid = ordinal => Number.isSafeInteger(ordinal) && ordinal >= 0 && ordinal < total;
  for (const [ordinal, required] of dependencies) {
    if (!valid(ordinal) || !Array.isArray(required) || required.some(value => !valid(value)) || new Set(required).size !== required.length) throw new RangeError("InvalidParagraphDependencies");
  }
  if (count > maxParagraphs) throw new RangeError("ParagraphWindowBudgetExceeded");
  const selected = new Set(), queue = [];
  const add = ordinal => {
    if (selected.has(ordinal)) return;
    if (selected.size >= maxParagraphs) throw new RangeError("ParagraphWindowBudgetExceeded");
    selected.add(ordinal); queue.push(ordinal);
  };
  for (let ordinal = offset; ordinal < offset + count; ordinal++) add(ordinal);
  for (let index = 0; index < queue.length; index++) for (const ordinal of dependencies.get(queue[index]) ?? []) add(ordinal);
  return { requestedOffset: offset, requestedCount: count, ordinals: [...selected].sort((a, b) => a - b) };
}
