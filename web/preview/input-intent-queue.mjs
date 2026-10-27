import { createTransientIntentDeque } from './transient-intent-deque.mjs';
// Unacknowledged DOM operations only; native responses own document revisions.
import { textChange } from './text-input.mjs';

export function createInputIntentQueue({ maxOperations = 1024, maxUnits = 16 * 1024 * 1024 } = {}) {
  if (
    !Number.isSafeInteger(maxOperations) ||
    maxOperations < 1 ||
    !Number.isSafeInteger(maxUnits) ||
    maxUnits < 0
  )
    throw new RangeError('InvalidInputIntentLimit');
  let base = null,
    projected = null,
    units = 0;
  const entries = createTransientIntentDeque();
  const clear = () => {
    entries.clear();
    base = projected = null;
    units = 0;
  };
  const peek = (committed) => {
    if (!entries.length) return null;
    if (committed !== base) throw new Error('InputIntentBaseMismatch');
    const entry = entries.front();
    return {
      ...entry,
      beforeSelection: structuredClone(entry.beforeSelection),
      afterText: base.slice(0, entry.startUnit) + entry.text + base.slice(entry.endUnit),
    };
  };
  return {
    get size() {
      return entries.length;
    },
    get projected() {
      return projected;
    },
    get hasCapacity() {
      return entries.length < maxOperations && units < maxUnits;
    },
    append(before, after, selection, beforeSelection) {
      if (
        typeof before !== 'string' ||
        typeof after !== 'string' ||
        !before.isWellFormed() ||
        !after.isWellFormed()
      )
        throw new Error('InvalidInputIntentText');
      if (entries.length && projected !== before) throw new Error('InputIntentChainMismatch');
      const change = textChange(before, after, selection);
      if (!change) return false;
      if (entries.length >= maxOperations || change.text.length > maxUnits - units)
        throw new RangeError('InputIntentLimit');
      const savedSelection = structuredClone(beforeSelection);
      entries.push({ ...change, beforeSelection: savedSelection });
      if (base === null) base = before;
      projected = after;
      units += change.text.length;
      return true;
    },
    peek,
    consume(committed) {
      const next = peek(committed);
      if (!next) return null;
      entries.shift();
      units -= next.text.length;
      base = next.afterText;
      if (!entries.length) clear();
      return next;
    },
    clear,
  };
}
