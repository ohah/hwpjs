import { createdTableIdentity } from './created-table-identity.mjs';
import { prepareIndependentTextRequest } from './independent-text-request.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';

const keys = new Set([
  'section',
  'identity',
  'row',
  'column',
  'startUnit',
  'endUnit',
  'text',
  'insertion',
]);
const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff && !Object.is(n, -0);
export function createCreatedCellTypingApi({
  wasm,
  memory,
  check,
  prefix,
  available,
  capabilities,
}) {
  const action = wasm[`${prefix}_splice_created_cell`];
  const version = wasm[`${prefix}_created_cell_typing_version`];
  const supported = () =>
    available() && typeof action === 'function' && typeof version === 'function' && version() === 1;
  return {
    supportsCreatedCellTypingAbi() {
      check();
      return supported();
    },
    createdCellTypingCapabilities() {
      check();
      if (!supported()) throw Error('CreatedCellTypingUnavailable');
      const value = capabilities();
      return {
        schemaVersion: 1,
        atomic: true,
        format: value.format,
        coordinateSpace: 'created-cell-utf16',
        requiresHistoryProtocol: 2,
        binding: value.binding,
        limits: value.limits,
      };
    },
    spliceCreatedCell(input) {
      check();
      if (!supported()) throw Error('CreatedCellTypingUnavailable');
      if (
        !input ||
        typeof input !== 'object' ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(input))
      )
        throw Error('InvalidCreatedCellTypingRequest');
      const request = Object.create(null);
      for (const key of Reflect.ownKeys(input)) {
        if (!keys.has(key)) throw Error('InvalidCreatedCellTypingRequest');
        const d = Object.getOwnPropertyDescriptor(input, key);
        if (!d || !Object.hasOwn(d, 'value')) throw Error('AccessorPayloadUnsupported');
        request[key] = d.value;
      }
      if (
        ![request.section, request.row, request.column, request.startUnit, request.endUnit].every(
          uint,
        ) ||
        request.endUnit < request.startUnit
      )
        throw RangeError('InvalidTextPosition');
      const id = createdTableIdentity(request.identity);
      if (typeof request.text !== 'string' || !request.text.isWellFormed())
        throw Error('InvalidUnicodeEncoding');
      const { binding, limits } = capabilities();
      if (
        request.text.length > 4 * 1024 * 1024 ||
        request.startUnit + request.text.length > 0xffffffff
      )
        throw Error('LimitExceeded');
      const text = new TextEncoder().encode(request.text);
      if (text.length > Math.min(limits.insertedBytes, 4 * 1024 * 1024))
        throw Error('LimitExceeded');
      const { bytes: wire } = prepareIndependentTextRequest(
        {
          schemaVersion: 1,
          binding,
          insertion: request.insertion === undefined ? { character: {} } : request.insertion,
        },
        { ...limits, requestBytes: Math.min(limits.requestBytes, 65536) },
      );
      const payload = new Uint8Array(text.length + wire.length);
      payload.set(text);
      payload.set(wire, text.length);
      return applyNativeEdit(
        memory,
        payload,
        (ptr) =>
          action(
            request.section,
            Number(id & 0xffffffffn),
            Number(id >> 32n),
            request.row,
            request.column,
            request.startUnit,
            request.endUnit,
            ptr,
            text.length,
            ptr + text.length,
            wire.length,
          ),
        'InvalidCreatedCellTypingResult',
      );
    },
  };
}
