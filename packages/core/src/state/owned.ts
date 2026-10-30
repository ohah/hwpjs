/** Copies at public boundaries. No WASM view or caller-owned backing store escapes. */
export function copyOwned<T>(value: T, observation = false, seen = new Set<object>()): T {
  // 내부 생성·동결 관측만 재사용합니다. 외부 accessor 입력은 이 권위를 얻지 못합니다.
  if (
    observation &&
    value !== null &&
    typeof value === 'object' &&
    immutableObservations.has(value)
  )
    return value;

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'undefined'
  )
    return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('InvalidNumber');
    return value;
  }
  if (typeof value !== 'object') throw new TypeError('UnsupportedPayload');
  if (
    typeof SharedArrayBuffer !== 'undefined' &&
    (value instanceof SharedArrayBuffer ||
      (ArrayBuffer.isView(value) && value.buffer instanceof SharedArrayBuffer))
  )
    throw new TypeError('SharedBufferUnsupported');
  if (value instanceof Uint8Array)
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice() as T;
  if (value instanceof ArrayBuffer) return value.slice(0) as T;
  if (seen.has(value)) throw new TypeError('CyclicPayload');
  seen.add(value);
  try {
    if (observation && value instanceof Map)
      return new Map(
        [...value].map(([k, v]) => [copyOwned(k, true, seen), copyOwned(v, true, seen)]),
      ) as T;
    if (observation && value instanceof Set)
      return new Set([...value].map((v) => copyOwned(v, true, seen))) as T;
    if (Array.isArray(value)) return value.map((v) => copyOwned(v, observation, seen)) as T;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError('UnsupportedPayload');
    const result: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw new TypeError('UnsupportedPayload');
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!('value' in descriptor)) throw new TypeError('AccessorPayloadUnsupported');
      if (observation && /^(password|plaintext|decryptedBytes)$/i.test(key)) continue;
      result[key] = copyOwned(descriptor.value, observation, seen);
    }
    return result as T;
  } finally {
    seen.delete(value);
  }
}
export function freezeDTO<T>(value: T): T {
  if (
    value &&
    typeof value === 'object' &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value) &&
    !(value instanceof Map) &&
    !(value instanceof Set)
  ) {
    if (immutableObservations.has(value)) {
      return value;
    }
    for (const child of Object.values(value)) freezeDTO(child);
    Object.freeze(value);
  }
  return value;
}
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
/** Consume rejections from prohibited async callbacks without awaiting them. */
export function discardPromise(value: unknown): void {
  if (isPromiseLike(value)) void Promise.resolve(value).catch(() => {});
}

const immutableObservations = new WeakSet<object>();
/** Internal membership query only. Does not brand, copy, or freeze caller input. */
export function isOwnedImmutableObservation(value: unknown): value is object {
  return value !== null && typeof value === 'object' && immutableObservations.has(value);
}

/** Stable plain DTOs with copy-on-access leaves for mutable built-in containers. */
export function ownObservation<T>(value: T): () => T {
  if (value && typeof value === 'object' && immutableObservations.has(value)) return () => value;
  const owned = copyOwned(value, true);
  const mutable = (item: unknown) =>
    item instanceof ArrayBuffer ||
    ArrayBuffer.isView(item) ||
    item instanceof Map ||
    item instanceof Set;
  const build = (item: unknown): unknown => {
    if (item === null || typeof item !== 'object') return item;
    if (immutableObservations.has(item)) return item;
    const node: Record<string, unknown> | unknown[] = Array.isArray(item)
      ? // oxlint-disable-next-line unicorn/no-new-array -- 소유 DTO 복제 시 원래 배열 길이와 희소 슬롯을 그대로 보존한다.
        new Array(item.length)
      : Object.create(null);
    for (const [key, child] of Object.entries(item)) {
      if (mutable(child)) {
        // The owned backing store exists only in this closure; consumers get copies.
        Object.defineProperty(node, key, {
          enumerable: true,
          get: () => freezeDTO(copyOwned(child, true)),
        });
      } else Object.defineProperty(node, key, { enumerable: true, value: build(child) });
    }
    Object.freeze(node);
    immutableObservations.add(node);
    return node;
  };
  if (mutable(owned)) return () => freezeDTO(copyOwned(owned, true));
  const stable = build(owned) as T;
  return () => stable;
}
