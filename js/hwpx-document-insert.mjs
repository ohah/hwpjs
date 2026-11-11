import { HWPX_DOCUMENT_INSERT_FUNCTIONS } from './abi-schema.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';

/** @typedef {{session: string, revision: number, serial: string}} DocumentInsertBinding */
/** @typedef {{schemaVersion: 1, binding: DocumentInsertBinding, maxSourceBytes: number}} DocumentInsertCapabilities */
/** @typedef {{binding: DocumentInsertBinding, section: number, paragraph: number, unit: number, bytes: Uint8Array}} DocumentInsertRequest */
/** @typedef {DocumentInsertRequest & {kind: 'insert-document', origin?: string, requestId?: string | number}} DocumentInsertRuntimeRequest */

const maxSourceBytes = 8 * 1024 * 1024;
const maxU64 = 0xffff_ffff_ffff_ffffn;
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const byteLength = Object.getOwnPropertyDescriptor(typedArray, 'byteLength').get;
const buffer = Object.getOwnPropertyDescriptor(typedArray, 'buffer').get;
let scopeSequence = 0n;

const u32 = (value) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff || Object.is(value, -0))
    throw new TypeError('InvalidDocumentInsertCoordinate');
  return value;
};

function ownRecord(record, keys, optional = []) {
  if (
    !record ||
    typeof record !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(record))
  )
    throw new TypeError('InvalidDocumentInsertRequest');
  const fields = Object.getOwnPropertyDescriptors(record);
  const result = Object.create(null);
  for (const key of Reflect.ownKeys(fields)) {
    if ((!keys.includes(key) && !optional.includes(key)) || !Object.hasOwn(fields[key], 'value'))
      throw new TypeError('InvalidDocumentInsertRequest');
    result[key] = fields[key].value;
  }
  if (!keys.every((key) => Object.hasOwn(result, key)))
    throw new TypeError('InvalidDocumentInsertRequest');
  return result;
}

function splitU64(text) {
  if (typeof text !== 'string' || !/^(?:0|[1-9]\d{0,19})$/.test(text))
    throw new TypeError('InvalidDocumentInsertBinding');
  const value = BigInt(text);
  if (value > maxU64) throw new TypeError('InvalidDocumentInsertBinding');
  return [Number(value & 0xffff_ffffn), Number(value >> 32n)];
}

function decodeBinding(binding) {
  const { session, revision, serial } = ownRecord(binding, ['session', 'revision', 'serial']);
  if (
    typeof session !== 'string' ||
    !/^(?:[a-z0-9-]{1,64}:)?s[1-9]\d{0,19}$/.test(session) ||
    u32(revision) === 0xffff_ffff
  )
    throw new TypeError('InvalidDocumentInsertBinding');
  const epochWords = splitU64(session.slice(session.lastIndexOf(':') + 2));
  return {
    binding: { session, revision, serial },
    wire: [revision, ...epochWords, ...splitU64(serial)],
  };
}

function copySource(bytes) {
  if (
    !ArrayBuffer.isView(bytes) ||
    !(bytes instanceof Uint8Array) ||
    (typeof SharedArrayBuffer !== 'undefined' && buffer.call(bytes) instanceof SharedArrayBuffer)
  )
    throw new TypeError('InvalidDocumentInsertSource');
  const length = byteLength.call(bytes);
  if (length === 0 || length > maxSourceBytes) throw new RangeError('LimitExceeded');
  return new Uint8Array(bytes);
}

/**
 * Own only the bounded donor view before Runtime queues or yields.
 * @returns {DocumentInsertRuntimeRequest} The Runtime paragraph is zero-based.
 */
export function copyDocumentInsertRuntimeMessage(message) {
  const { kind, binding, section, paragraph, unit, bytes, origin, requestId } = ownRecord(
    message,
    ['kind', 'binding', 'section', 'paragraph', 'unit', 'bytes'],
    ['origin', 'requestId'],
  );
  if (
    kind !== 'insert-document' ||
    (origin !== undefined && typeof origin !== 'string') ||
    (requestId !== undefined && typeof requestId !== 'string' && !Number.isSafeInteger(requestId))
  )
    throw new TypeError('InvalidDocumentInsertRequest');
  return {
    kind,
    binding: decodeBinding(binding).binding,
    section: u32(section),
    paragraph: u32(paragraph),
    unit: u32(unit),
    bytes: copySource(bytes),
    ...(origin === undefined ? {} : { origin }),
    ...(requestId === undefined ? {} : { requestId }),
  };
}

export function createHwpxDocumentInsertApi({ wasm, memory, check }) {
  const supported = HWPX_DOCUMENT_INSERT_FUNCTIONS.every(
    (name) => typeof wasm[name] === 'function',
  );
  const scope = supported ? (globalThis.crypto?.randomUUID?.() ?? String(++scopeSequence)) : null;
  function ready() {
    check();
    if (!supported) throw new Error('DocumentInsertionUnavailable');
  }
  return {
    supportsDocumentInsertionAbi: () => supported,
    /** @returns {DocumentInsertCapabilities} */
    documentInsertionCapabilities() {
      ready();
      if (wasm.hwpx_edit_document_insert_capabilities() !== 1) throw memory.error();
      try {
        const length = wasm.hwpx_edit_output_len();
        if (!Number.isSafeInteger(length) || length <= 0 || length > 512)
          throw new TypeError('InvalidDocumentInsertionCapabilities');
        const data = memory.copy(wasm.hwpx_edit_output_ptr(), length);
        const decoded = ownRecord(
          JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)),
          ['schemaVersion', 'binding', 'maxSourceBytes'],
        );
        if (decoded.schemaVersion !== 1 || decoded.maxSourceBytes !== maxSourceBytes)
          throw new TypeError('InvalidDocumentInsertionCapabilities');
        const binding = decodeBinding(decoded.binding).binding;
        if (!binding.session.startsWith('s') || binding.session.includes(':'))
          throw new TypeError('InvalidDocumentInsertionCapabilities');
        return Object.freeze({
          schemaVersion: 1,
          binding: Object.freeze({ ...binding, session: scope + ':' + binding.session }),
          maxSourceBytes,
        });
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    /**
     * @param {DocumentInsertRequest} input Native 1-based paragraph, original UTF-16 caret.
     * @returns {ReturnType<typeof applyNativeEdit>}
     */
    insertDocument(input) {
      ready();
      const { binding, section, paragraph, unit, bytes } = ownRecord(input, [
        'binding',
        'section',
        'paragraph',
        'unit',
        'bytes',
      ]);
      const current = decodeBinding(binding);
      if (!current.binding.session.startsWith(scope + ':'))
        throw new Error('StaleDocumentInsertBinding');
      const args = [u32(section), u32(paragraph), u32(unit), ...current.wire];
      const payload = copySource(bytes);
      return applyNativeEdit(
        memory,
        payload,
        (ptr, length) => wasm.hwpx_edit_insert_document(...args, ptr, length),
        'InvalidDocumentInsertResult',
      );
    },
  };
}
