// Unstable reader-only port; shares Core's evidence and observation modules.
// No issuer, setter, history admission or public index export.
export {
  readNativeReadSourceEvidence,
  isCurrentDocumentTextSelectionObservation,
} from '../../../core/src/_internal/native-read-source.ts';
