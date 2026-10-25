
function copyOwned(value, observation = false, seen = new Set) {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "undefined")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("InvalidNumber");
    return value;
  }
  if (typeof value !== "object")
    throw new TypeError("UnsupportedPayload");
  if (typeof SharedArrayBuffer !== "undefined" && (value instanceof SharedArrayBuffer || ArrayBuffer.isView(value) && value.buffer instanceof SharedArrayBuffer))
    throw new TypeError("SharedBufferUnsupported");
  if (value instanceof Uint8Array)
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  if (value instanceof ArrayBuffer)
    return value.slice(0);
  if (seen.has(value))
    throw new TypeError("CyclicPayload");
  seen.add(value);
  try {
    if (observation && value instanceof Map)
      return new Map([...value].map(([k, v]) => [copyOwned(k, true, seen), copyOwned(v, true, seen)]));
    if (observation && value instanceof Set)
      return new Set([...value].map((v) => copyOwned(v, true, seen)));
    if (Array.isArray(value))
      return value.map((v) => copyOwned(v, observation, seen));
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null)
      throw new TypeError("UnsupportedPayload");
    const result = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string")
        throw new TypeError("UnsupportedPayload");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!("value" in descriptor))
        throw new TypeError("AccessorPayloadUnsupported");
      if (observation && /^(password|plaintext|decryptedBytes)$/i.test(key))
        continue;
      result[key] = copyOwned(descriptor.value, observation, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}
function freezeDTO(value) {
  if (value && typeof value === "object" && !(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value) && !(value instanceof Map) && !(value instanceof Set)) {
    for (const child of Object.values(value))
      freezeDTO(child);
    Object.freeze(value);
  }
  return value;
}
function isPromiseLike(value) {
  return !!value && (typeof value === "object" || typeof value === "function") && typeof value.then === "function";
}
function discardPromise(value) {
  if (isPromiseLike(value))
    Promise.resolve(value).catch(() => {});
}
var immutableObservations = new WeakSet;
function ownObservation(value) {
  if (value && typeof value === "object" && immutableObservations.has(value))
    return () => value;
  const owned = copyOwned(value, true);
  const mutable = (item) => item instanceof ArrayBuffer || ArrayBuffer.isView(item) || item instanceof Map || item instanceof Set;
  const build = (item) => {
    if (item === null || typeof item !== "object")
      return item;
    const node = Array.isArray(item) ? new Array(item.length) : Object.create(null);
    for (const [key, child] of Object.entries(item)) {
      if (mutable(child)) {
        Object.defineProperty(node, key, { enumerable: true, get: () => freezeDTO(copyOwned(child, true)) });
      } else
        Object.defineProperty(node, key, { enumerable: true, value: build(child) });
    }
    Object.freeze(node);
    immutableObservations.add(node);
    return node;
  };
  if (mutable(owned))
    return () => freezeDTO(copyOwned(owned, true));
  const stable = build(owned);
  return () => stable;
}

export { copyOwned, freezeDTO, isPromiseLike, discardPromise, ownObservation };

