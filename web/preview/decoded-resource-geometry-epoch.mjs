const ownValue = (value, key) => {
  const d = Object.getOwnPropertyDescriptor(value, key);
  return d && Object.hasOwn(d, 'value') ? { value: d.value } : null;
};
const nativeFunction = (fn) =>
  typeof fn === 'function' && Function.prototype.toString.call(fn).includes('[native code]');
function bitmapSize(bitmap, realm) {
  try {
    if (!bitmap || typeof bitmap !== 'object') return null;
    const width = ownValue(bitmap, 'width'),
      height = ownValue(bitmap, 'height');
    if (width && height)
      return Number.isFinite(width.value) && Number.isFinite(height.value)
        ? [width.value, height.value]
        : null;
    const ctor = Object.getOwnPropertyDescriptor(realm, 'ImageBitmap')?.value;
    const proto =
      typeof ctor === 'function' ? Object.getOwnPropertyDescriptor(ctor, 'prototype')?.value : null;
    if (!nativeFunction(ctor) || !proto || Object.getPrototypeOf(bitmap) !== proto) return null;
    const w = Object.getOwnPropertyDescriptor(proto, 'width'),
      h = Object.getOwnPropertyDescriptor(proto, 'height');
    if (!nativeFunction(w?.get) || !nativeFunction(h?.get)) return null;
    const a = Reflect.apply(w.get, bitmap, []),
      b = Reflect.apply(h.get, bitmap, []);
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
  } catch {
    return null;
  }
}
// 바이트/decoder identity의 동등성은 picture-resources가 소유합니다.
// 같은 entry의 재검증 완료는 paint 세대와 구분하며, 알 수 없는 관측은 항상 무효화합니다.
export function createDecodedResourceGeometryEpoch(realm = globalThis) {
  let entries = new WeakMap(),
    epoch = 0;
  return {
    get value() {
      return epoch;
    },
    clear() {
      entries = new WeakMap();
      epoch++;
    },
    observe(entry) {
      if (!entry || typeof entry !== 'object') {
        epoch++;
        return epoch;
      }
      const bitmap = ownValue(entry, 'bitmap'),
        error = ownValue(entry, 'error'),
        refreshing = ownValue(entry, 'refreshing');
      if (!bitmap || !error || !refreshing || refreshing.value !== false) {
        epoch++;
        entries.delete(entry);
        return epoch;
      }
      const size = bitmap.value === null ? [0, 0] : bitmapSize(bitmap.value, realm);
      if (
        !size ||
        (error.value !== null && error.value !== undefined && typeof error.value !== 'string')
      ) {
        epoch++;
        entries.delete(entry);
        return epoch;
      }
      const next = [bitmap.value, ...size, error.value],
        previous = entries.get(entry);
      if (!previous || next.some((v, i) => v !== previous[i])) epoch++;
      entries.set(entry, next);
      return epoch;
    },
  };
}
