// Bounded owned transport data only. Native owns field schema, source permission,
// coverage, edit semantics and the existing history transaction.
const invalid = () => Error('InvalidTextTransactionDTO');
export function prepareIndependentTextRequest(input, limits) {
  for (const key of ['requestBytes', 'requestDepth', 'requestStructure'])
    if (!Number.isSafeInteger(limits?.[key]) || limits[key] <= 0)
      throw Error('InvalidTextTransactionLimits');
  if (limits.requestDepth > 64) throw Error('InvalidTextTransactionLimits');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
  let bytes = 0,
    structure = 0;
  const active = new Set();
  const addBytes = (amount) => {
    if (amount > limits.requestBytes - bytes) throw Error('LimitExceeded');
    bytes += amount;
  };
  const addStructure = (amount) => {
    if (amount > limits.requestStructure - structure) throw Error('LimitExceeded');
    structure += amount;
    addBytes(amount);
  };
  const string = (value) => {
    addBytes(2);
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw Error('InvalidUnicodeEncoding');
        addBytes(4);
      } else if (code >= 0xdc00 && code <= 0xdfff) throw Error('InvalidUnicodeEncoding');
      else if (code === 34 || code === 92) addBytes(2);
      else if (code < 32) addBytes([8, 9, 10, 12, 13].includes(code) ? 2 : 6);
      else addBytes(code < 128 ? 1 : code < 2048 ? 2 : 3);
    }
    return value;
  };
  const copy = (value, depth) => {
    if (value === null) {
      addBytes(4);
      return value;
    }
    if (typeof value === 'string') return string(value);
    if (typeof value === 'boolean') {
      addBytes(value ? 4 : 5);
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw Error('InvalidNumber');
      addBytes(JSON.stringify(value).length);
      return value;
    }
    if (typeof value !== 'object' || active.has(value)) throw invalid();
    if (depth > limits.requestDepth) throw Error('LimitExceeded');
    const array = Array.isArray(value);
    const proto = Object.getPrototypeOf(value);
    if (!array && proto !== Object.prototype && proto !== null) throw invalid();
    const keys = Reflect.ownKeys(value);
    // Local input traversal is bounded even for omitted undefined properties.
    if (keys.length > limits.requestStructure) throw Error('LimitExceeded');
    addStructure(2);
    const output = array ? Object.setPrototypeOf([], null) : Object.create(null);
    active.add(value);
    try {
      let count = 0;
      for (const key of keys) {
        if (array && key === 'length') continue;
        if (typeof key !== 'string') throw invalid();
        if (array && !/^(0|[1-9][0-9]*)$/.test(key)) throw invalid();
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value'))
          throw Error('AccessorPayloadUnsupported');
        if (descriptor.value === undefined) {
          if (array) throw invalid();
          continue;
        }
        if (count++) addStructure(1);
        if (!array) {
          string(key);
          addStructure(1);
        }
        output[key] = copy(descriptor.value, depth + 1);
      }
      if (array) {
        const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
        if (count !== length || output.length !== length) throw invalid();
        for (let index = 0; index < length; index++)
          if (!Object.hasOwn(output, index)) throw invalid();
      }
      return output;
    } finally {
      active.delete(value);
    }
  };
  const value = copy(input, 1);
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  // Exact accounting includes UTF-8, escaping and all JSON punctuation. Checking
  // the result also prevents accidental future undercounting from reaching WASM.
  if (encoded.length !== bytes) throw Error('InvalidTextTransactionEncoding');
  return { value, bytes: encoded };
}
