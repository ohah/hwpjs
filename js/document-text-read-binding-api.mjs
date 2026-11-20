import { validDocumentTextReadStamp } from './document-text-read-stamp.mjs';
import { keys, documentTextFormat } from './document-text-observation-schema.mjs';
// Native-owned read counters retain their own names; never fill a History revision.
export function createDocumentTextReadBindingApi({ wasm, memory, check, prefix }) {
  const format = documentTextFormat(prefix);
  const available = () =>
    ['document_text_read_binding', 'output_ptr', 'output_len', 'output_free'].every(
      (name) => typeof wasm[`${prefix}_${name}`] === 'function',
    );
  return {
    supportsDocumentTextReadBinding() {
      check();
      return available();
    },
    documentTextReadBinding() {
      check();
      if (!available()) throw Error('DocumentTextReadBindingUnavailable');
      try {
        if (wasm[`${prefix}_document_text_read_binding`]() !== 1) throw memory.error();
        const length = wasm[`${prefix}_output_len`]();
        if (!Number.isSafeInteger(length) || length < 0 || length > 2048)
          throw Error('LimitExceeded');
        const value = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            memory.copy(wasm[`${prefix}_output_ptr`](), length),
          ),
        );
        if (
          !keys(value, [
            'schemaVersion',
            'scope',
            'executionAuthority',
            'format',
            'session',
            'epoch',
            'serial',
          ]) ||
          value.schemaVersion !== 1 ||
          value.scope !== 'native-document-text-read-binding' ||
          value.executionAuthority !== false ||
          value.format !== format ||
          typeof value.session !== 'string' ||
          !value.session ||
          value.session.length > 256 ||
          !validDocumentTextReadStamp({ epoch: value.epoch, serial: value.serial })
        )
          throw Error('MalformedDocumentTextReadBinding');
        check();
        return value;
      } finally {
        wasm[`${prefix}_output_free`]();
      }
    },
  };
}
