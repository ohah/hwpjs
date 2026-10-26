let current = null;
const fallback = new WeakMap();
const functionSource = Function.prototype.toString;
const nativeFunction = (value) =>
  typeof value === 'function' && /\{\s*\[native code\]\s*\}/.test(functionSource.call(value));
// identity 조회는 알 수 없는 전역 accessor를 실행하지 않습니다.
function dataConstructor() {
  try {
    const intl = Object.getOwnPropertyDescriptor(globalThis, 'Intl');
    if (!intl || !Object.hasOwn(intl, 'value')) return null;
    const constructor = Object.getOwnPropertyDescriptor(intl.value, 'Segmenter');
    return constructor && Object.hasOwn(constructor, 'value') ? constructor.value : null;
  } catch {
    return null;
  }
}
function currentInstance(value, prototype) {
  return (
    Object.getPrototypeOf(value) === prototype &&
    !Object.getOwnPropertyDescriptor(value, 'segment') &&
    !Object.getOwnPropertyDescriptor(value, 'resolvedOptions')
  );
}
// cache 적격성만 확인합니다. 알 수 없는 구현의 분절 사용 자체를 거부하지 않습니다.
function webEntry(C, kind) {
  try {
    if (!nativeFunction(C)) return null;
    const prototype = Object.getOwnPropertyDescriptor(C, 'prototype')?.value;
    const segment = Object.getOwnPropertyDescriptor(prototype, 'segment')?.value;
    const resolve = Object.getOwnPropertyDescriptor(prototype, 'resolvedOptions')?.value;
    if (!nativeFunction(segment) || !nativeFunction(resolve)) return null;
    let record = fallback.get(C);
    if (
      !record ||
      record.prototype !== prototype ||
      record.segment !== segment ||
      record.resolve !== resolve
    ) {
      record = { prototype, segment, resolve, kinds: new Map() };
      fallback.set(C, record);
    }
    const cached = record.kinds.get(kind);
    if (cached && !currentInstance(cached.value, prototype)) record.kinds.delete(kind);
    if (!record.kinds.has(kind)) {
      const value = new C('ko', { granularity: kind });
      if (!currentInstance(value, prototype)) return null;
      const options = resolve.call(value);
      if (options.locale !== 'ko' || options.granularity !== kind) return null;
      const empty = segment.call(value, '');
      if (!empty || typeof empty[Symbol.iterator] !== 'function') return null;
      record.kinds.set(kind, { value, identity: Object.freeze({}) });
    }
    return record.kinds.get(kind);
  } catch {
    return null;
  }
}
export function withTextBoundaries(provider, callback) {
  if (!provider) throw Error('TextBoundaryProviderMissing');
  const old = current;
  current = provider;
  try {
    const v = callback();
    if (v && typeof v.then === 'function') throw Error('AsyncTextBoundaryScope');
    return v;
  } finally {
    current = old;
  }
}
// null은 증분 cache 비적격입니다. 현재 Native 포트에는 의미 epoch 계약이 없습니다.
export function currentTextBoundaryIdentity() {
  if (current) return null;
  return webEntry(dataConstructor(), 'grapheme')?.identity ?? null;
}
export function createTextSegmenter(kind) {
  const provider = current;
  if (provider)
    return {
      segment(text) {
        if (kind === 'word') return provider.word();
        const rows = provider.segments(text);
        return {
          [Symbol.iterator]: () => rows[Symbol.iterator](),
          containing(unit) {
            return rows.find((r) => r.index <= unit && unit < r.index + r.segment.length);
          },
        };
      },
    };
  const C = globalThis.Intl?.Segmenter;
  if (typeof C !== 'function') throw Error('IntlSegmenterUnavailable');
  return (
    (dataConstructor() === C ? webEntry(C, kind)?.value : null) ??
    new C('ko', { granularity: kind })
  );
}
export const createNativeGraphemeSegmenter = () => createTextSegmenter('grapheme');
export const createNativeWordSegmenter = () => createTextSegmenter('word');
