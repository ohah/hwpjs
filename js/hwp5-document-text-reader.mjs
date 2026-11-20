import { HWP5_DOCUMENT_TEXT_READ_FUNCTIONS } from './abi-schema.mjs';
import { createDocumentTextApi } from './document-text-api.mjs';
/** Optional query-only transport in the readonly reader's instance. No editor exports. */
export function createHwp5DocumentTextReader({ wasm, memory, check }) {
  const available = HWP5_DOCUMENT_TEXT_READ_FUNCTIONS.every(
    (name) => typeof wasm[name] === 'function',
  );
  let opened = false,
    reason = 'DocumentTextReadNotOpen';
  const active = () => {
    check();
    if (!opened) throw Error(reason);
  };
  const readMemory = {
    ...memory,
    error() {
      const length = wasm.hwp5_read_error_len();
      if (!Number.isSafeInteger(length) || length < 0 || length > 2048)
        return Error('MalformedDocumentTextReadError');
      return Error(
        new TextDecoder('utf-8', { fatal: true }).decode(
          memory.copy(wasm.hwp5_read_error_ptr(), length),
        ) || 'NativeReadonlyReadRejected',
      );
    },
  };
  const api = createDocumentTextApi({
    wasm,
    memory: readMemory,
    check: active,
    prefix: 'hwp5_read',
  });
  const domain = (value) => {
    if (
      !value?.binding?.session?.startsWith('v-s') ||
      value.binding.revision !== null ||
      (value.ref !== undefined && !value.ref.startsWith('v-d2-'))
    )
      throw Error('WrongDocumentTextReadDomain');
    return value;
  };
  const retire = () => {
    const hadOwner = opened;
    opened = false;
    reason = 'DocumentTextReadNotOpen';
    if (hadOwner) wasm.hwp5_read_close();
  };
  return {
    retire,
    observe(bytes) {
      check();
      retire();
      if (!available) {
        reason = 'Hwp5DocumentTextReadAbiUnavailable';
        return;
      }
      try {
        memory.withBytes(bytes, (ptr, size) => {
          if (wasm.hwp5_read_open(ptr, size) !== 1) throw readMemory.error();
        });
        check();
        opened = true;
        reason = null;
      } catch (error) {
        opened = false;
        reason = error?.message || 'DocumentTextReadOpenFailed';
        // A failed candidate can leave an older Native owner alive. The public
        // readonly reader must never present it as the requested new document.
        wasm.hwp5_read_close();
      }
    },
    publicApi: {
      documentTextReadStatus() {
        check();
        return Object.freeze({ available: opened, reason });
      },
      supportsDocumentTextSnapshot() {
        check();
        return opened && api.supportsDocumentTextSnapshot();
      },
      supportsDocumentTextAnchor() {
        check();
        return opened && api.supportsDocumentTextAnchor();
      },
      supportsDocumentTextSelection() {
        check();
        return opened && api.supportsDocumentTextSelection();
      },
      supportsDocumentTextReadBinding() {
        check();
        return opened && api.supportsDocumentTextReadBinding();
      },
      documentTextReadBinding() {
        const value = api.documentTextReadBinding();
        if (!value.session.startsWith('v-s')) throw Error('WrongDocumentTextReadDomain');
        return value;
      },
      documentTextSnapshot() {
        const value = domain(api.documentTextSnapshot());
        if (value.rows.some((row) => typeof row.ref !== 'string' || !row.ref.startsWith('v-d2-')))
          throw Error('WrongDocumentTextReadDomain');
        return value;
      },
      documentTextSelection(input) {
        return domain(api.documentTextSelection(input));
      },
      documentTextAnchor(input) {
        return domain(api.documentTextAnchor(input));
      },
    },
  };
}
