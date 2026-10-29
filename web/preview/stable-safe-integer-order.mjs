// 비음수 safe integer의 전체 53비트를 보존합니다. 입력 배열과 원소는 수정하지 않습니다.
export function stableSafeIntegerOrder(items, keyAt, counters) {
  if (!Array.isArray(items) || typeof keyAt !== 'function')
    throw new TypeError('InvalidStableIntegerOrderInput');
  const length = items.length;
  // oxlint-disable-next-line unicorn/no-new-array -- 작업 버퍼는 입력 길이로 한정됩니다.
  const result = new Array(length);
  const keys = new Float64Array(length);
  let sorted = true;
  let previous = -1;
  let maximum = 0;
  for (let index = 0; index < length; index++) {
    const key = keyAt(items[index], index);
    if (counters) counters.keyReads = (counters.keyReads ?? 0) + 1;
    if (!Number.isSafeInteger(key) || key < 0) throw new RangeError('InvalidStableIntegerOrderKey');
    keys[index] = key;
    result[index] = items[index];
    if (key < previous) sorted = false;
    previous = key;
    if (key > maximum) maximum = key;
    if (counters) counters.initialCopies = (counters.initialCopies ?? 0) + 1;
  }
  if (sorted) return result;
  // 고정 상한 16 아래의 비교는 최대 120회입니다. 문서 크기로 상한을 늘리지 않습니다.
  if (length <= 16) {
    if (counters) counters.smallBatches = (counters.smallBatches ?? 0) + 1;
    for (let index = 1; index < length; index++) {
      const key = keys[index];
      const item = result[index];
      let cursor = index - 1;
      while (cursor >= 0) {
        if (counters) counters.smallComparisons = (counters.smallComparisons ?? 0) + 1;
        if (keys[cursor] <= key) break;
        result[cursor + 1] = result[cursor];
        keys[cursor + 1] = keys[cursor];
        cursor--;
        if (counters) counters.smallMoves = (counters.smallMoves ?? 0) + 1;
      }
      result[cursor + 1] = item;
      keys[cursor + 1] = key;
    }
    return result;
  }
  let from = result;
  // oxlint-disable-next-line unicorn/no-new-array -- 안정 scatter의 재사용 작업 버퍼입니다.
  let into = new Array(length);
  let fromKeys = keys;
  let intoKeys = new Float64Array(length);
  const buckets = new Uint32Array(256);
  // 256의 거듭제곱은 정확히 표현됩니다. 32비트 키 변환을 하지 않습니다.
  for (let factor = 1; factor <= maximum; factor *= 256) {
    buckets.fill(0);
    let used = 0;
    if (counters) {
      counters.radixPasses = (counters.radixPasses ?? 0) + 1;
      counters.bucketClears = (counters.bucketClears ?? 0) + 256;
    }
    for (let index = 0; index < length; index++) {
      const digit = Math.floor(fromKeys[index] / factor) % 256;
      if (buckets[digit] === 0) used++;
      buckets[digit]++;
      if (counters) counters.countVisits = (counters.countVisits ?? 0) + 1;
    }
    if (used === 1) continue;
    let offset = 0;
    for (let digit = 0; digit < 256; digit++) {
      const size = buckets[digit];
      buckets[digit] = offset;
      offset += size;
    }
    if (counters) counters.bucketPrefixes = (counters.bucketPrefixes ?? 0) + 256;
    for (let index = 0; index < length; index++) {
      const digit = Math.floor(fromKeys[index] / factor) % 256;
      const target = buckets[digit]++;
      into[target] = from[index];
      intoKeys[target] = fromKeys[index];
      if (counters) counters.scatterVisits = (counters.scatterVisits ?? 0) + 1;
    }
    [from, into] = [into, from];
    [fromKeys, intoKeys] = [intoKeys, fromKeys];
  }
  if (from !== result) {
    for (let index = 0; index < length; index++) {
      result[index] = from[index];
      if (counters) counters.finalCopies = (counters.finalCopies ?? 0) + 1;
    }
  }
  return result;
}
