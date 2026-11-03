// 모듈 초기 신뢰 realm의 함수만 private clone에 사용한다. Native 권위를 발급하지 않는다.
const descriptor = Object.getOwnPropertyDescriptor;
const ownKeys = Reflect.ownKeys;
const freeze = Object.freeze;
const prototype = Object.getPrototypeOf;
const setPrototype = Object.setPrototypeOf;
const apply = Reflect.apply;
const hasOwn = Object.hasOwn;
const weakHas = WeakSet.prototype.has,
  weakAdd = WeakSet.prototype.add;
const initialClone = descriptor(globalThis, 'structuredClone');
const ports = new WeakSet();
const contains = (set, value) => apply(weakHas, set, [value]);
const add = (set, value) => apply(weakAdd, set, [value]);
export function createMeasurementPlacementPort() {
  const port = freeze({});
  add(ports, port);
  return port;
}
export function isMeasurementPlacementPort(port) {
  return contains(ports, port);
}
export function clonePrivateMeasurement(value, { preserveNullPrototype = false } = {}) {
  if (typeof preserveNullPrototype !== 'boolean') throw Error('InvalidPrivateMeasurementOption');
  const now = descriptor(globalThis, 'structuredClone');
  if (
    !initialClone ||
    !hasOwn(initialClone, 'value') ||
    typeof initialClone.value !== 'function' ||
    !now ||
    !hasOwn(now, 'value') ||
    now.value !== initialClone.value ||
    now.writable !== initialClone.writable ||
    now.enumerable !== initialClone.enumerable ||
    now.configurable !== initialClone.configurable
  )
    return null;
  const copy = apply(initialClone.value, globalThis, [value]);
  const seen = new WeakSet();
  const originalCopies = preserveNullPrototype ? new WeakMap() : null;
  function visit(object, original) {
    if (!object || typeof object !== 'object' || contains(seen, object)) return;
    const proto = prototype(object);
    if (proto !== Object.prototype && proto !== Array.prototype && proto !== null)
      throw Error('UnsupportedPrivateMeasurement');
    if (preserveNullPrototype) {
      const sourceProto = prototype(original);
      if (
        ![Object.prototype, Array.prototype, null].includes(sourceProto) ||
        Array.isArray(object) !== Array.isArray(original)
      )
        throw Error('UnsupportedPrivateMeasurement');
      const previous = originalCopies.get(original);
      if (previous && previous !== object) throw Error('AmbiguousPrivateMeasurementAlias');
      originalCopies.set(original, object);
      if (sourceProto === null) setPrototype(object, null);
      else if (proto !== sourceProto) throw Error('UnsupportedPrivateMeasurement');
      const sourceKeys = ownKeys(original);
      if (sourceKeys.length !== ownKeys(object).length)
        throw Error('UnsupportedPrivateMeasurement');
    }
    add(seen, object);
    const keys = ownKeys(object);
    for (let i = 0; i < keys.length; i++) {
      const d = descriptor(object, keys[i]);
      if (!d || !hasOwn(d, 'value')) throw Error('UnsupportedPrivateMeasurement');
      const source = preserveNullPrototype ? descriptor(original, keys[i]) : null;
      if (preserveNullPrototype && (!source || !hasOwn(source, 'value')))
        throw Error('UnsupportedPrivateMeasurement');
      visit(d.value, source?.value);
    }
    freeze(object);
  }
  visit(copy, value);
  return { value: copy };
}
