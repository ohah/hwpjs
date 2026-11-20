import {
  validDocumentTextReadStamp,
  sameDocumentTextReadStamp,
} from './document-text-read-stamp.mjs';
import { prepareIndependentTextRequest } from './independent-text-request.mjs';

const scope = 'native-document-text-selection';
const maxReplyBytes = 16 * 1024 * 1024;
import {
  documentTextFormat,
  uint,
  keys,
  binding,
  scalarText,
  scalarBoundary,
  identity,
} from './document-text-observation-schema.mjs';

// This optional query returns an owned read observation. Canvas must separately
// prove current painted ownership and geometry before installing a selection.
export function createDocumentTextSelectionApi({ wasm, memory, check, prefix }) {
  const format = documentTextFormat(prefix);
  const available = () =>
    ['document_text_selection', 'output_ptr', 'output_len', 'output_free'].every(
      (name) => typeof wasm[`${prefix}_${name}`] === 'function',
    );
  return {
    supportsDocumentTextSelection() {
      check();
      return available();
    },
    documentTextSelection(input) {
      check();
      if (!available()) throw Error('DocumentTextSelectionUnavailable');
      const owned = prepareIndependentTextRequest(input, {
        requestBytes: maxReplyBytes,
        requestDepth: 8,
        requestStructure: 64,
      });
      const request = owned.value;
      if (
        !keys(request, [
          'schemaVersion',
          'scope',
          'binding',
          'ref',
          'startUnit',
          'endUnit',
          'expectedOriginal',
          ...(Object.hasOwn(request, 'readBinding') ? ['readBinding'] : []),
        ]) ||
        request.schemaVersion !== 1 ||
        request.scope !== scope ||
        !binding(request.binding) ||
        (Object.hasOwn(request, 'readBinding') &&
          !validDocumentTextReadStamp(request.readBinding)) ||
        typeof request.ref !== 'string' ||
        !request.ref ||
        new TextEncoder().encode(request.ref).length > 256 ||
        !uint(request.startUnit) ||
        !uint(request.endUnit) ||
        request.startUnit >= request.endUnit ||
        typeof request.expectedOriginal !== 'string' ||
        !request.expectedOriginal ||
        request.expectedOriginal.length > 200000 ||
        request.expectedOriginal.length !== request.endUnit - request.startUnit
      )
        throw Error('InvalidDocumentTextSelectionRequest');
      return memory.withBytes(owned.bytes, (ptr, size) => {
        try {
          if (wasm[`${prefix}_document_text_selection`](ptr, size) !== 1) throw memory.error();
          const length = wasm[`${prefix}_output_len`]();
          if (!Number.isSafeInteger(length) || length < 0 || length > maxReplyBytes)
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
              'expectedOriginal',
              'beforeText',
              'target',
            ]) ||
            value.schemaVersion !== 1 ||
            value.scope !== scope ||
            value.coordinateSpace !== 'native-current-text-observation' ||
            value.executionAuthority !== false ||
            value.format !== format ||
            !binding(value.binding) ||
            !sameDocumentTextReadStamp(value.readBinding, request.readBinding) ||
            value.binding.session !== request.binding.session ||
            value.binding.revision !== request.binding.revision ||
            value.ref !== request.ref ||
            value.expectedOriginal !== request.expectedOriginal ||
            !scalarText(value.beforeText) ||
            value.beforeText.length > 4 * 1024 * 1024
          )
            throw Error('MalformedDocumentTextSelection');
          const target = value.target;
          const paragraph = target?.kind === 'paragraph';
          if (
            !(paragraph
              ? keys(target, ['kind', 'section', 'paragraph', 'startUnit', 'endUnit']) &&
                uint(target.paragraph)
              : target?.kind === 'created-cell' &&
                keys(target, [
                  'kind',
                  'section',
                  'identity',
                  'row',
                  'column',
                  'startUnit',
                  'endUnit',
                ]) &&
                identity(target.identity) &&
                uint(target.row) &&
                uint(target.column)) ||
            !uint(target.section) ||
            !uint(target.startUnit) ||
            !uint(target.endUnit) ||
            target.startUnit >= target.endUnit ||
            target.endUnit > value.beforeText.length ||
            !scalarBoundary(value.beforeText, target.startUnit) ||
            !scalarBoundary(value.beforeText, target.endUnit) ||
            value.beforeText.slice(target.startUnit, target.endUnit) !== request.expectedOriginal
          )
            throw Error('MalformedDocumentTextSelection');
          return value;
        } finally {
          wasm[`${prefix}_output_free`]();
        }
      });
    },
  };
}
