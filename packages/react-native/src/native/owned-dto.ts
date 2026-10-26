/** Transport boundary copy, not an editor-state implementation. Keep this portable
 * to Hermes (no structuredClone/DOM/Worker dependency). Request and reply buffers
 * have independent backing stores. Native HostObjects/pointers never pass here.
 * Shared extraction of this helper is main-owned; no core internal import.
 */
export function copyTransportDTO<T>(value: T, seen = new Set<object>()): T {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  )
    return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw TypeError('NativeInvalidNumber');
    return value;
  }
  if (typeof value !== 'object') throw TypeError('NativeUnsupportedPayload');
  if (
    typeof SharedArrayBuffer !== 'undefined' &&
    (value instanceof SharedArrayBuffer ||
      (ArrayBuffer.isView(value) && value.buffer instanceof SharedArrayBuffer))
  )
    throw TypeError('NativeSharedBufferUnsupported');
  if (value instanceof Uint8Array)
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice() as T;
  if (value instanceof ArrayBuffer) return value.slice(0) as T;
  if (seen.has(value)) throw TypeError('NativeCyclicPayload');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      // Read descriptors rather than invoking arbitrary getters on array elements.
      // oxlint-disable-next-line unicorn/no-new-array -- 소유 DTO 복제 시 원래 배열 길이와 희소 슬롯을 그대로 보존한다.
      const result: unknown[] = new Array(value.length);
      for (const key of Reflect.ownKeys(value)) {
        if (key === 'length') continue;
        if (typeof key !== 'string') throw TypeError('NativeUnsupportedPayload');
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!('value' in descriptor)) throw TypeError('NativeAccessorPayloadUnsupported');
        Object.defineProperty(result, key, {
          value: copyTransportDTO(descriptor.value, seen),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return result as T;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      throw TypeError('NativeUnsupportedPayload');
    const result: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw TypeError('NativeUnsupportedPayload');
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!('value' in descriptor)) throw TypeError('NativeAccessorPayloadUnsupported');
      result[key] = copyTransportDTO(descriptor.value, seen);
    }
    return result as T;
  } finally {
    seen.delete(value);
  }
}
