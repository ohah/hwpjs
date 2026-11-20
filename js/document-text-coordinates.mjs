// Native HWPX paragraph ordinals are one-based; renderer paragraphs are zero-based.
// HWP5 and typed created-cell identities retain their existing axes.
const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff;
export function nativeDocumentParagraph(format, displayParagraph) {
  if (!uint(displayParagraph)) return undefined;
  if (format === 'hwp5') return displayParagraph;
  if (format === 'hwpx' && displayParagraph < 0xffffffff) return displayParagraph + 1;
  return undefined;
}
export function displayDocumentParagraph(format, nativeParagraph) {
  if (!uint(nativeParagraph)) return undefined;
  if (format === 'hwp5') return nativeParagraph;
  if (format === 'hwpx' && nativeParagraph > 0) return nativeParagraph - 1;
  return undefined;
}
