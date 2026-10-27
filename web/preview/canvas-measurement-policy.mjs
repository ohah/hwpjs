import { PROJECTION_CANVAS_CONTEXT_FIELDS } from './projection-measure-memo.mjs';

const fields = [...PROJECTION_CANVAS_CONTEXT_FIELDS, 'font'];
function descriptor(value, key) {
  let owner = value;
  for (let depth = 0; owner && depth < 8; depth++, owner = Object.getPrototypeOf(owner)) {
    const value = Object.getOwnPropertyDescriptor(owner, key);
    if (value) return { owner, value };
  }
  return null;
}
const nativeFunction = (fn, name) =>
  typeof fn === 'function' &&
  Function.prototype.toString.call(fn) === `function ${name}() { [native code] }`;
const epochToken = (v) =>
  v && typeof v === 'object' && Object.isFrozen(v) && Reflect.ownKeys(v).length === 0;
const sameDescriptor = (a, b) =>
  a &&
  b &&
  ['value', 'get', 'set', 'writable', 'enumerable', 'configurable'].every(
    (key) => a[key] === b[key],
  );

// 임의 함수의 내부 가변 상태는 identity만으로 검증하지 않습니다.
export function createCanvasMeasurementPolicy(ctx, realm = globalThis) {
  const ctor = Object.getOwnPropertyDescriptor(realm, 'CanvasRenderingContext2D')?.value;
  const proto =
    typeof ctor === 'function' ? Object.getOwnPropertyDescriptor(ctor, 'prototype')?.value : null;
  const expectedFields = new Map(
    fields.map((key) => [key, proto && Object.getOwnPropertyDescriptor(proto, key)]),
  );
  let previous = null,
    token = null;
  return {
    current(explicitEpoch) {
      try {
        if (explicitEpoch !== undefined && !epochToken(explicitEpoch)) return null;
        const method = descriptor(ctx, 'measureText');
        if (
          !method ||
          !Object.hasOwn(method.value, 'value') ||
          typeof method.value.value !== 'function'
        )
          return null;
        // prototype의 현재 함수와 native 문자열은 원본 intrinsic 증명이 아닙니다.
        // host가 내부 측정 의미의 변경을 통지하는 명시 버전을 제공해야 합니다.
        if (!epochToken(explicitEpoch)) return null;
        const snapshot = [
          Object.getPrototypeOf(ctx),
          method.owner,
          method.value.value,
          method.value.writable,
          method.value.configurable,
          method.value.enumerable,
          explicitEpoch,
        ];
        for (const key of fields) {
          const item = descriptor(ctx, key);
          if (!item) {
            snapshot.push(null, undefined);
            continue;
          }
          const d = item.value;
          let value;
          if (Object.hasOwn(d, 'value')) value = d.value;
          else {
            const expected = expectedFields.get(key);
            if (
              item.owner !== proto ||
              !sameDescriptor(d, expected) ||
              !nativeFunction(d.get, 'get ' + key)
            )
              return null;
            value = Reflect.apply(d.get, ctx, []);
          }
          if (value !== undefined && typeof value !== 'string') return null;
          snapshot.push(
            item.owner,
            value,
            d.value,
            d.get,
            d.set,
            d.writable,
            d.enumerable,
            d.configurable,
          );
        }
        if (
          !previous ||
          previous.length !== snapshot.length ||
          previous.some((v, i) => v !== snapshot[i])
        ) {
          previous = snapshot;
          token = Object.freeze({});
        }
        return token;
      } catch {
        return null;
      }
    },
  };
}
