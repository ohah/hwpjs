// @ts-ignore The existing byte-signature discriminator remains the single implementation.
import { detectDocumentFormat as detect } from '../../../js/document-format.mjs';
/** Container discrimination only; native parsers validate HWP5/HWPX semantics. */
export function detectDocumentFormat(input: Uint8Array | ArrayBuffer): 'hwp5' | 'hwpx' {
  return detect(input);
}
