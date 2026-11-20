import { documentTextFormat } from './document-text-observation-schema.mjs';
import { validDocumentTextReadStamp } from './document-text-read-stamp.mjs';
import { createDocumentTextReadBindingApi } from './document-text-read-binding-api.mjs';
import { createDocumentTextAnchorApi } from './document-text-anchor-api.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
import { prepareIndependentTextRequest } from './independent-text-request.mjs';
import { createDocumentTextSelectionApi } from './document-text-selection-api.mjs';

// Optional complete-text transport. No edit policy, reference issuer or fallback
// through per-paragraph writes belongs in this memory/ABI adapter.
export function createDocumentTextApi({ wasm, memory, check, prefix }) {
  const format = documentTextFormat(prefix);
  const available = () =>
    ['document_text_snapshot', 'output_ptr', 'output_len', 'output_free'].every(
      (name) => typeof wasm[`${prefix}_${name}`] === 'function',
    );
  return {
    ...createDocumentTextSelectionApi({ wasm, memory, check, prefix }),
    ...createDocumentTextAnchorApi({ wasm, memory, check, prefix }),
    ...createDocumentTextReadBindingApi({ wasm, memory, check, prefix }),
    supportsDocumentTextSnapshot() {
      check();
      return available();
    },
    supportsDocumentReplaceAll() {
      check();
      return available() && typeof wasm[`${prefix}_replace_document_text`] === 'function';
    },
    replaceDocumentText(input) {
      check();
      if (!available() || typeof wasm[`${prefix}_replace_document_text`] !== 'function')
        throw Error('DocumentReplaceAllUnavailable');
      // Reuse the existing bounded, accessor-free owned JSON transport. Its
      // serializer does not confer the independent-text schema or authority.
      const owned = prepareIndependentTextRequest(input, {
        requestBytes: 16 * 1024 * 1024,
        requestDepth: 16,
        requestStructure: 262144,
      });
      const value = owned.value;
      const binding = value.binding;
      if (
        value.schemaVersion !== 1 ||
        value.scope !== 'native-document-text' ||
        Object.keys(value).some(
          (key) => !['schemaVersion', 'scope', 'binding', 'query', 'replacement'].includes(key),
        ) ||
        !binding ||
        typeof binding !== 'object' ||
        Array.isArray(binding) ||
        Object.keys(binding).some((key) => !['session', 'revision'].includes(key)) ||
        typeof binding.session !== 'string' ||
        !binding.session ||
        !Number.isSafeInteger(binding.revision) ||
        binding.revision < 0 ||
        binding.revision >= 0xffffffff ||
        typeof value.query !== 'string' ||
        !value.query ||
        value.query.length > 200000 ||
        typeof value.replacement !== 'string' ||
        new TextEncoder().encode(value.replacement).length > 4 * 1024 * 1024
      )
        throw Error('InvalidDocumentReplaceAllRequest');
      return applyNativeEdit(
        memory,
        owned.bytes,
        (ptr, length) => wasm[`${prefix}_replace_document_text`](ptr, length),
        'InvalidDocumentReplaceAllResult',
      );
    },
    documentTextSnapshot() {
      check();
      if (!available()) throw Error('DocumentTextSnapshotUnavailable');
      try {
        if (wasm[`${prefix}_document_text_snapshot`]() !== 1) throw memory.error();
        const length = wasm[`${prefix}_output_len`]();
        if (!Number.isSafeInteger(length) || length < 0 || length > 16 * 1024 * 1024)
          throw Error('LimitExceeded');
        const value = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            memory.copy(wasm[`${prefix}_output_ptr`](), length),
          ),
        );
        if (
          value?.schemaVersion !== 1 ||
          value.scope !== 'native-document-text' ||
          value.complete !== true ||
          value.format !== format ||
          !Array.isArray(value.rows) ||
          !value.coverage ||
          !value.binding ||
          (Object.hasOwn(value, 'readBinding') && !validDocumentTextReadStamp(value.readBinding))
        )
          throw Error('MalformedDocumentTextSnapshot');
        return value;
      } finally {
        wasm[`${prefix}_output_free`]();
      }
    },
  };
}
