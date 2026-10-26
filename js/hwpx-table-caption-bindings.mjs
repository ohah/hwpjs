/** Current native global 1-based paragraph numbers and source-tree owners. */
import { decodeCaptionBindings } from './caption-bindings-wire.mjs';
export function decodeTableCaptionBindings(bytes) {
  return decodeCaptionBindings(bytes, 'table_node', 'InvalidTableCaptionBindings');
}
