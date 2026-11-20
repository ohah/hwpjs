import {
  validDocumentTextReadStamp,
  sameDocumentTextReadStamp,
} from './document-text-read-stamp.mjs';
import { prepareIndependentTextRequest } from './independent-text-request.mjs';
import {
  documentTextFormat,
  uint,
  keys,
  binding,
  scalarText,
  scalarBoundary,
  identity,
} from './document-text-observation-schema.mjs';
const scope = 'native-document-text-anchor';
const maximum = 16 * 1024 * 1024;
export function createDocumentTextAnchorApi({ wasm, memory, check, prefix }) {
  const format = documentTextFormat(prefix);
  const available = () =>
    ['document_text_anchor', 'output_ptr', 'output_len', 'output_free'].every(
      (name) => typeof wasm[`${prefix}_${name}`] === 'function',
    );
  return {
    supportsDocumentTextAnchor() {
      check();
      return available();
    },
    documentTextAnchor(input) {
      check();
      if (!available()) throw Error('DocumentTextAnchorUnavailable');
      const owned = prepareIndependentTextRequest(input, {
        requestBytes: maximum,
        requestDepth: 8,
        requestStructure: 64,
      });
      const request = owned.value,
        point = request.target;
      const paragraph = point?.kind === 'paragraph';
      if (
        !keys(request, [
          'schemaVersion',
          'scope',
          'binding',
          'target',
          ...(Object.hasOwn(request, 'readBinding') ? ['readBinding'] : []),
        ]) ||
        request.schemaVersion !== 1 ||
        request.scope !== scope ||
        !binding(request.binding) ||
        (Object.hasOwn(request, 'readBinding') &&
          !validDocumentTextReadStamp(request.readBinding)) ||
        !(paragraph
          ? keys(point, ['kind', 'section', 'paragraph', 'unit', 'beforeText']) &&
            uint(point.paragraph)
          : point?.kind === 'created-cell' &&
            keys(point, ['kind', 'section', 'identity', 'row', 'column', 'unit', 'beforeText']) &&
            identity(point.identity) &&
            uint(point.row) &&
            uint(point.column)) ||
        !uint(point.section) ||
        !uint(point.unit) ||
        !scalarText(point.beforeText) ||
        point.beforeText.length > 4 * 1024 * 1024 ||
        point.unit > point.beforeText.length ||
        !scalarBoundary(point.beforeText, point.unit)
      )
        throw Error('InvalidDocumentTextAnchorRequest');
      return memory.withBytes(owned.bytes, (ptr, size) => {
        try {
          if (wasm[`${prefix}_document_text_anchor`](ptr, size) !== 1) throw memory.error();
          const length = wasm[`${prefix}_output_len`]();
          if (!Number.isSafeInteger(length) || length < 0 || length > maximum)
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
              'coordinateSpace',
              'executionAuthority',
              'format',
              ...(Object.hasOwn(value, 'readBinding') ? ['readBinding'] : []),
              'binding',
              'ref',
              'startUnit',
              'endUnit',
            ]) ||
            value.schemaVersion !== 1 ||
            value.scope !== scope ||
            value.coordinateSpace !== 'native-read-inventory' ||
            value.executionAuthority !== false ||
            value.format !== format ||
            !binding(value.binding) ||
            !sameDocumentTextReadStamp(value.readBinding, request.readBinding) ||
            value.binding.session !== request.binding.session ||
            value.binding.revision !== request.binding.revision ||
            typeof value.ref !== 'string' ||
            !value.ref ||
            new TextEncoder().encode(value.ref).length > 256 ||
            !uint(value.startUnit) ||
            value.startUnit !== value.endUnit ||
            value.startUnit > 4 * 1024 * 1024
          )
            throw Error('MalformedDocumentTextAnchor');
          check();
          return value;
        } finally {
          wasm[`${prefix}_output_free`]();
        }
      });
    },
  };
}
