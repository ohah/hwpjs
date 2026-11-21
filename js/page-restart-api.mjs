import { PAGE_RESTART_EDIT_ABI } from './abi-schema.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const invalid = () => {
  throw Error('InvalidPageRestartWire');
};
function record(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    keys.some((key) => !descriptors[key] || !Object.hasOwn(descriptors[key], 'value'))
  )
    return invalid();
  return value;
}
function decimal(value, max, nonzero = false) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(value)) return invalid();
  const number = BigInt(value);
  if (number > max || (nonzero && number === 0n)) return invalid();
  return value;
}
const index = (value) =>
  Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value <= 0xffffffff;
function binding(value) {
  record(value, ['session', 'revision', 'serial']);
  if (typeof value.session !== 'string' || !value.session.length || value.session.length > 1024)
    return invalid();
  decimal(value.revision, 0xffffffffn);
  decimal(value.serial, 0xffffffffffffffffn);
  return Object.freeze({ ...value });
}
function packet(value, format) {
  record(value, ['schemaVersion', 'format', 'binding', 'rows']);
  if (
    value.schemaVersion !== 1 ||
    value.format !== format ||
    !Array.isArray(value.rows) ||
    value.rows.length > 20000
  )
    return invalid();
  const current = binding(value.binding);
  const seen = new Set();
  const leases = new Set();
  const rows = value.rows.map((input) => {
    record(input, ['section', 'controlNode', 'paragraph', 'number', 'observation', 'reason']);
    if (
      !index(input.section) ||
      input.section >= 512 ||
      !(input.controlNode === null || index(input.controlNode)) ||
      !(input.paragraph === null || index(input.paragraph)) ||
      !(input.number === null || (index(input.number) && input.number <= 65535))
    )
      return invalid();
    const identity = `${input.section}:${input.controlNode}`;
    if (seen.has(identity)) return invalid();
    seen.add(identity);
    if (input.observation === null) {
      if (typeof input.reason !== 'string' || !input.reason.length || input.reason.length > 256)
        return invalid();
      return Object.freeze({ ...input });
    }
    const before = record(input.observation, ['lease', 'session', 'revision', 'serial']);
    if (
      input.reason !== null ||
      input.controlNode === null ||
      input.paragraph === null ||
      input.number === null ||
      input.number === 0 ||
      ['session', 'revision', 'serial'].some((key) => before[key] !== current[key])
    )
      return invalid();
    decimal(before.lease, 0xffffffffffffffffn, true);
    if (leases.has(before.lease)) return invalid();
    leases.add(before.lease);
    return Object.freeze({ ...input, observation: Object.freeze({ ...before }) });
  });
  return Object.freeze({ schemaVersion: 1, format, binding: current, rows: Object.freeze(rows) });
}

/** Actual SDK issuer identity stays private. Native owns current-state admission. */
export function createPageRestartApi({ wasm, memory, check, prefix }) {
  if (!['hwp5_edit', 'hwpx_edit'].includes(prefix)) return invalid();
  const format = prefix === 'hwp5_edit' ? 'hwp5' : 'hwpx';
  const names = Object.keys(PAGE_RESTART_EDIT_ABI).filter((name) => name.startsWith(prefix + '_'));
  const query = `${prefix}_page_restart_capabilities`;
  const write = `${prefix}_write_page_restart`;
  let issued = new WeakSet();
  const supported = () =>
    names.every(
      (name) =>
        typeof wasm[name] === 'function' &&
        wasm[name].length === PAGE_RESTART_EDIT_ABI[name].params.length,
    );
  return {
    supportsPageRestartWrite() {
      check();
      return supported();
    },
    pageRestartCapabilities() {
      check();
      issued = new WeakSet();
      if (!supported()) throw Error('PageRestartWriteUnavailable');
      let result;
      try {
        if (wasm[query]() !== 1) throw memory.error();
        const length = wasm[`${prefix}_output_len`]();
        if (!Number.isSafeInteger(length) || length < 1 || length > 16 * 1024 * 1024)
          return invalid();
        result = packet(
          JSON.parse(decoder.decode(memory.copy(wasm[`${prefix}_output_ptr`](), length))),
          format,
        );
      } finally {
        wasm[`${prefix}_output_free`]();
      }
      for (const row of result.rows) if (row.observation) issued.add(row.observation);
      return result;
    },
    ownsPageRestartObservation(before) {
      check();
      return before !== null && typeof before === 'object' && issued.has(before);
    },
    writePageRestart(input) {
      check();
      record(input, ['before', 'number']);
      const { before, number } = input;
      if (!index(number) || number < 1 || number > 65535) throw Error('InvalidPageRestartNumber');
      if (!supported()) throw Error('PageRestartWriteUnavailable');
      if (!before || typeof before !== 'object' || !issued.has(before))
        throw Error('StalePageRestartObservation');
      // Consume before invocation. Unknown/cleanup outcomes must never be retried.
      issued.delete(before);
      return applyNativeEdit(
        memory,
        encoder.encode(JSON.stringify({ before, number })),
        (ptr, len) => wasm[write](ptr, len),
        'InvalidPageRestartOutcome',
      );
    },
  };
}
