import { toHtml } from '@ohah/hwpjs';

export async function exportHTML(
  documentBytes: Uint8Array,
  wasmBytes: Uint8Array,
): Promise<string> {
  return toHtml(documentBytes, {
    wasm: wasmBytes,
    embedImages: 'supported',
  });
}
