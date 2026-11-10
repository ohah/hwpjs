import { applyNativeEdit } from './native-edit-outcome.mjs';

// Optional atomic ABI. No fallback to repeated setters or an editor.update collector.
export function createAtomicFormattingApi({ wasm, memory, check, prefix }) {
  const suffixes = [
    'formatting_capabilities',
    'query_formatting',
    'apply_formatting_patch',
    'output_ptr',
    'output_len',
    'output_free',
    'history_revision',
    'history_stats',
  ];
  const available = () => suffixes.every((s) => typeof wasm[`${prefix}_${s}`] === 'function');
  const required = () => {
    check();
    if (!available()) throw Error('AtomicFormattingUnavailable');
  };
  const read = (action) => {
    try {
      if (action() !== 1) throw memory.error();
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          memory.copy(wasm[`${prefix}_output_ptr`](), wasm[`${prefix}_output_len`]()),
        ),
      );
    } finally {
      wasm[`${prefix}_output_free`]();
    }
  };
  const caps = () => {
    required();
    const value = read(() => wasm[`${prefix}_formatting_capabilities`]());
    if (
      value?.schemaVersion !== 1 ||
      value.atomic !== true ||
      value.format !== prefix.replace(/_edit$/, '') ||
      value.coordinateSpace !== 'native-source-utf16' ||
      value.requiresHistoryProtocol !== 2 ||
      typeof value.binding?.session !== 'string' ||
      !value.binding.session ||
      !value.fields ||
      typeof value.fields !== 'object' ||
      Array.isArray(value.fields) ||
      !Object.values(value.fields).some((field) => field && field.readable === true) ||
      !value.limits ||
      !['requestBytes', 'replyBytes', 'targets', 'ranges', 'commands', 'fontNameBytes'].every(
        (k) => Number.isSafeInteger(value.limits[k]) && value.limits[k] > 0,
      )
    )
      throw Error('AtomicFormattingUnavailable');
    if (
      value.binding.revision !== null &&
      (!Number.isSafeInteger(value.binding.revision) ||
        value.binding.revision < 0 ||
        value.binding.revision >= 0xffffffff)
    )
      throw Error('InvalidFormattingBinding');
    return value;
  };
  const encode = (value, limit) => {
    const bytes = new TextEncoder().encode(JSON.stringify(ownedJSON(value)));
    if (bytes.byteLength > limit) throw Error('LimitExceeded');
    return bytes;
  };
  return {
    supportsAtomicFormatting() {
      check();
      return available();
    },
    atomicFormattingCapabilities: caps,
    queryFormatting(request) {
      const policy = caps();
      const bytes = encode(request, policy.limits.requestBytes);
      const value = memory.withBytes(bytes, (ptr, size) =>
        read(() => wasm[`${prefix}_query_formatting`](ptr, size)),
      );
      if (
        value?.schemaVersion !== 1 ||
        !Array.isArray(value.targets) ||
        !value.observations ||
        value.binding?.session !== request.binding?.session ||
        value.binding?.revision !== request.binding?.revision
      )
        throw Error('MalformedFormattingQuery');
      return value;
    },
    applyFormattingPatch(request) {
      const policy = caps();
      const bytes = encode(request, policy.limits.requestBytes);
      return applyNativeEdit(
        memory,
        bytes,
        (ptr, size) => wasm[`${prefix}_apply_formatting_patch`](ptr, size),
        'InvalidAtomicFormattingResult',
      );
    },
  };
}
// Descriptor reads reject accessors without evaluating them. Undefined object
// fields are omitted; explicit null reaches Native's strict write validator.
function ownedJSON(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('InvalidNumber');
    return value;
  }
  if (typeof value !== 'object' || seen.has(value)) throw Error('InvalidFormattingDTO');
  const array = Array.isArray(value),
    proto = Object.getPrototypeOf(value);
  if (!array && proto !== Object.prototype && proto !== null) throw Error('InvalidFormattingDTO');
  seen.add(value);
  try {
    const result = array ? [] : Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string') throw Error('InvalidFormattingDTO');
      if (array && !/^(0|[1-9][0-9]*)$/.test(key)) throw Error('InvalidFormattingDTO');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) throw Error('AccessorPayloadUnsupported');
      if (descriptor.value === undefined) {
        if (array) throw Error('InvalidFormattingDTO');
        continue;
      }
      result[key] = ownedJSON(descriptor.value, seen);
    }
    if (array && result.length !== value.length) throw Error('InvalidFormattingDTO');
    for (let i = 0; array && i < value.length; i++)
      if (!Object.hasOwn(result, i)) throw Error('InvalidFormattingDTO');
    return result;
  } finally {
    seen.delete(value);
  }
}
