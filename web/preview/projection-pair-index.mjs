// 한 동기 투영의 정확한 pair lookup입니다. 문서/호출 사이에 index를 재사용하지 않습니다.
const none = Object.freeze({ count: 0, first: undefined });
export function createProjectionPairIndex(rows, firstKey, secondKey, { enabled = true } = {}) {
  rows ??= [];
  let built = false,
    index = null,
    entryVisits = 0,
    fallbackEntryVisits = 0,
    queries = 0;
  function build() {
    built = true;
    if (!enabled || !Array.isArray(rows)) return;
    const arrayDescriptors = Object.getOwnPropertyDescriptors(rows),
      length = arrayDescriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0) return;
    const groups = new Map();
    for (let position = 0; position < length; position++) {
      const item = arrayDescriptors[String(position)];
      if (!item || !Object.hasOwn(item, 'value')) return;
      const row = item.value;
      entryVisits++;
      if (!row || ![Object.prototype, null].includes(Object.getPrototypeOf(row))) return;
      const descriptors = Object.getOwnPropertyDescriptors(row);
      if (Reflect.ownKeys(descriptors).some((key) => !Object.hasOwn(descriptors[key], 'value')))
        return;
      const observed = Object.isFrozen(row)
        ? row
        : Object.freeze(
            Object.defineProperties(Object.create(Object.getPrototypeOf(row)), descriptors),
          );
      const first = descriptors[firstKey],
        second = descriptors[secondKey];
      if (!first || !second) return;
      const a = first.value,
        b = second.value;
      if (Number.isNaN(a) || Number.isNaN(b)) continue;
      let group = groups.get(a);
      if (!group) {
        group = new Map();
        groups.set(a, group);
      }
      const old = group.get(b);
      if (old) old.count++;
      else group.set(b, { count: 1, first: observed });
    }
    index = groups;
  }
  return {
    find(first, second) {
      queries++;
      if (!built) {
        try {
          build();
        } catch {
          built = true;
          index = null;
        }
      }
      if (index)
        return Number.isNaN(first) || Number.isNaN(second)
          ? none
          : (index.get(first)?.get(second) ?? none);
      // 외부 mutable/accessor 입력은 원래의 strict equality 탐색 의미를 유지합니다.
      const matches = rows.filter((row) => {
        fallbackEntryVisits++;
        return row[firstKey] === first && row[secondKey] === second;
      });
      return matches.length ? { count: matches.length, first: matches[0] } : none;
    },
    stats: () => ({ entryVisits, fallbackEntryVisits, queries, indexed: index !== null }),
  };
}

// 외부 실행 가능한 값이 없는 plain data만 지역 색인 전제에 사용합니다.
// 권위 등록이나 문서 간 memo가 아니며, 매 호출 다시 검증합니다.
export function isProjectionDataOnly(value) {
  const active = new WeakSet(),
    seen = new WeakSet(),
    stack = [{ value, exit: false }];
  try {
    while (stack.length) {
      const item = stack.pop(),
        node = item.value;
      if (node === null || ['undefined', 'string', 'number', 'boolean'].includes(typeof node))
        continue;
      if (typeof node !== 'object') return false;
      if (item.exit) {
        active.delete(node);
        seen.add(node);
        continue;
      }
      if (active.has(node)) return false;
      if (seen.has(node)) continue;
      const proto = Object.getPrototypeOf(node);
      if (![Object.prototype, Array.prototype, null].includes(proto)) return false;
      active.add(node);
      stack.push({ value: node, exit: true });
      const descriptors = Object.getOwnPropertyDescriptors(node);
      for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== 'string') return false;
        const d = descriptors[key];
        if (!Object.hasOwn(d, 'value')) return false;
        stack.push({ value: d.value, exit: false });
      }
    }
    return true;
  } catch {
    return false;
  }
}
