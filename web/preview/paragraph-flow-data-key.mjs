// 환경·분절 정책·문서 clear까지 깊이 불변인 하위 그래프만 재사용합니다.
// stats는 해당 수명 동안 누적하며 문자열 단위 상한은 실제 heap 바이트 상한이 아닙니다.
export function createProjectionDataKey({ maxEntries = 4096, maxUnits = 2097152 } = {}) {
  const memo = new WeakMap();
  const quotedStrings = new Map();
  let quotedHits = 0;
  function quote(value) {
    const old = quotedStrings.get(value);
    if (old !== undefined) {
      quotedHits++;
      return old;
    }
    const encoded = JSON.stringify(value);
    const size = value.length + encoded.length;
    if (entries + quotedStrings.size < maxEntries && units + size <= maxUnits) {
      quotedStrings.set(value, encoded);
      units += size;
    }
    return encoded;
  }
  let entries = 0,
    units = 0,
    hits = 0,
    visits = 0;
  function dataKey(value, limit = 262144, onFailure = () => {}, skipRootKeys = null) {
    const seen = new Set();
    let budget = limit;
    function visit(v, depth) {
      if (--budget < 0 || depth > 32) throw Error('FlowKeyBudget');
      visits++;
      if (v === null) return 'null';
      if (typeof v === 'undefined') return 'undefined';
      if (typeof v === 'boolean') return String(v);
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) throw Error('FlowKeyNumber');
        return Object.is(v, -0) ? '-0' : String(v);
      }
      if (typeof v === 'string') {
        budget -= v.length;
        if (budget < 0) throw Error('FlowKeyBudget');
        return quote(v);
      }
      if (typeof v !== 'object' || seen.has(v)) throw Error('FlowKeyObject');
      const array = Array.isArray(v);
      if (array && v.length > budget) throw Error('FlowKeyBudget');
      if (!array && ![null, Object.prototype].includes(Object.getPrototypeOf(v)))
        throw Error('FlowKeyPrototype');
      const rootSkipped = depth === 0 && skipRootKeys !== null;
      const old = rootSkipped ? undefined : memo.get(v);
      if (old) {
        budget -= old.cost;
        if (budget < 0 || depth + old.depth > 32) throw Error('FlowKeyBudget');
        hits++;
        return old;
      }
      const before = budget;
      let immutable = Object.isFrozen(v),
        maxDepth = 0;
      seen.add(v);
      const parts = [];
      for (const key of Reflect.ownKeys(v)) {
        if (typeof key !== 'string') throw Error('FlowKeySymbol');
        if (depth === 0 && skipRootKeys?.has(key)) continue;
        budget -= key.length;
        if (budget < 0) throw Error('FlowKeyBudget');
        const d = Object.getOwnPropertyDescriptor(v, key);
        if (!Object.hasOwn(d, 'value')) throw Error('FlowKeyAccessor');
        const child = visit(d.value, depth + 1);
        const primitive = typeof child === 'string';
        immutable &&= primitive || child.immutable;
        maxDepth = Math.max(maxDepth, (primitive ? 0 : child.depth) + 1);
        parts.push(quote(key), ':', primitive ? child : child.text, ',');
      }
      seen.delete(v);
      const result = {
        text: (array ? '[' : '{') + parts.join('') + (array ? ']' : '}'),
        immutable,
        depth: maxDepth,
        cost: before - budget,
      };
      if (
        immutable &&
        !rootSkipped &&
        entries + quotedStrings.size < maxEntries &&
        units + result.text.length <= maxUnits
      ) {
        memo.set(v, result);
        entries++;
        units += result.text.length;
      }
      return result;
    }
    try {
      const result = visit(value, 0);
      return typeof result === 'string' ? result : result.text;
    } catch (error) {
      onFailure(error.message);
      return null;
    }
  }
  dataKey.stats = () => ({
    entries,
    units,
    hits,
    visits,
    quotedHits,
    quotedEntries: quotedStrings.size,
    totalEntries: entries + quotedStrings.size,
  });
  return dataKey;
}
