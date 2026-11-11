// Input projection only. Native owns the semantic string and source spelling.
export const formTextProjection = (text) => text.replace(/\r\n|\r/g, '\n');
function offsets(raw) {
  const map = [0];
  for (let i = 0; i < raw.length;) {
    if (raw[i] === '\r' && raw[i + 1] === '\n') i += 2;
    else i++;
    map.push(i);
  }
  return map;
}
function inputRange(previous, next, inputType, change) {
  if (!change || change.projection !== previous || change.inputType !== inputType) return null;
  let { start, end } = change;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    end > previous.length
  )
    return null;
  if (start === end) {
    const removed = previous.length - next.length;
    if (inputType.startsWith('delete') && inputType.endsWith('Backward')) start -= removed;
    else if (inputType.startsWith('delete') && inputType.endsWith('Forward')) end += removed;
    else if (!inputType.startsWith('insert')) return null;
  }
  const last = previous.length - end;
  if (
    start < 0 ||
    end < start ||
    end > previous.length ||
    next.length < start + last ||
    !next.startsWith(previous.slice(0, start)) ||
    !next.endsWith(previous.slice(end))
  )
    return null;
  return { first: start, last };
}
export function createFormTextDraft(original) {
  if (typeof original !== 'string' || original.length > 65535 || !original.isWellFormed())
    throw Error('FormTextBudget');
  let raw = original,
    projection = formTextProjection(raw);
  let history = [{ raw, projection }],
    position = 0;
  const remember = () => {
    history = history.slice(0, position + 1);
    history.push({ raw, projection });
    position++;
    let units = history.reduce((n, x) => n + x.raw.length, 0);
    while (history.length > 1 && (history.length > 64 || units > 262144)) {
      units -= history.shift().raw.length;
      position--;
    }
  };
  const kinds = new Set(original.match(/\r\n|\r|\n/g) ?? []);
  const insertionEol = kinds.size === 1 ? [...kinds][0] : '\n';
  return {
    get raw() {
      return raw;
    },
    get projection() {
      return projection;
    },
    get insertionEol() {
      return insertionEol;
    },
    update(next, inputType = '', change = null) {
      if (
        typeof next !== 'string' ||
        next.includes('\r') ||
        next.length > 65535 ||
        !next.isWellFormed()
      )
        throw Error('FormTextProjectionBudget');
      if (inputType === 'historyUndo' || inputType === 'historyRedo') {
        const direction = inputType === 'historyUndo' ? -1 : 1;
        for (let i = position + direction; i >= 0 && i < history.length; i += direction) {
          if (history[i].projection === next) {
            position = i;
            raw = history[i].raw;
            projection = next;
            return raw;
          }
        }
      }
      if (next === projection) return raw;
      let range = inputRange(projection, next, inputType, change);
      if (!range) {
        let prefix = 0,
          suffix = 0;
        while (
          prefix < projection.length &&
          prefix < next.length &&
          projection[prefix] === next[prefix]
        )
          prefix++;
        while (
          suffix < projection.length &&
          suffix < next.length &&
          projection[projection.length - 1 - suffix] === next[next.length - 1 - suffix]
        )
          suffix++;
        const unchanged = Math.min(projection.length, next.length, prefix + suffix);
        const first = Math.min(prefix, unchanged),
          last = unchanged - first;
        const earliest = Math.max(0, unchanged - suffix);
        // Repeated projected line ends can correspond to different raw ends.
        // Without an observed edit range, never choose which original end to lose.
        if (
          kinds.size > 1 &&
          earliest < first &&
          projection.slice(earliest, projection.length - last).includes('\n')
        )
          throw Error('AmbiguousFormTextEdit');
        if (
          kinds.size > 1 &&
          projection.slice(first, projection.length - last).includes('\n') &&
          next.slice(first, next.length - last).includes('\n')
        )
          throw Error('UnobservedFormTextReplacement');
        range = { first, last };
      }
      const map = offsets(raw),
        { first, last } = range;
      const inserted = next.slice(first, next.length - last).replace(/\n/g, insertionEol);
      const candidate =
        raw.slice(0, map[first]) + inserted + raw.slice(map[projection.length - last]);
      if (candidate.length > 65535) throw Error('FormTextBudget');
      raw = candidate;
      projection = next;
      remember();
      return raw;
    },
  };
}
