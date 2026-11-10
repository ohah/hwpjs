import { prepareIndependentTextRequest } from './independent-text-request.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
import { textTransactionArgs } from './text-transaction-args.mjs';

const keys = new Set([
  'section',
  'paragraph',
  'startUnit',
  'endUnit',
  'text',
  'textMode',
  'beginElement',
  'insertion',
]);
const modes = ['plain', 'anchored', 'field'];
const requestLimit = 65536;

export function createRichTypingApi({ wasm, memory, check, prefix, available, capabilities }) {
  const action = wasm[`${prefix}_splice_rich_character`];
  const hwp5 = prefix === 'hwp5_edit';
  const supported = () => typeof action === 'function' && available();
  return {
    supportsRichTypingAbi() {
      check();
      return supported();
    },
    spliceWithRichCharacter(input) {
      check();
      if (!supported()) throw Error('RichTypingUnavailable');
      const { binding, limits } = capabilities();
      if (
        !input ||
        typeof input !== 'object' ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(input))
      )
        throw Error('InvalidRichTypingRequest');
      const request = Object.create(null);
      for (const key of Reflect.ownKeys(input)) {
        if (!keys.has(key)) throw Error('InvalidRichTypingRequest');
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value'))
          throw Error('AccessorPayloadUnsupported');
        request[key] = descriptor.value;
      }
      const { positions, bytes } = textTransactionArgs(request);
      const kind = modes.indexOf(request.textMode ?? 'plain');
      const begin = request.beginElement ?? 0;
      if (kind < 0 || (hwp5 && (kind !== 0 || begin !== 0))) throw Error('InvalidTextKind');
      if (!Number.isInteger(begin) || begin < 0 || begin > 0xffffffff)
        throw Error('InvalidTextPosition');
      const { bytes: wire } = prepareIndependentTextRequest(
        { schemaVersion: 1, binding, insertion: request.insertion },
        { ...limits, requestBytes: Math.min(limits.requestBytes, requestLimit) },
      );
      // One allocation scope preserves the primitive completion even if cleanup throws.
      const payload = new Uint8Array(bytes.length + wire.length);
      payload.set(bytes);
      payload.set(wire, bytes.length);
      const mode = hwp5 ? [] : [kind, begin];
      return applyNativeEdit(
        memory,
        payload,
        (ptr) => action(...positions, ptr, bytes.length, ptr + bytes.length, wire.length, ...mode),
        'InvalidRichTypingResult',
      );
    },
  };
}
