export function normalizeParagraphReplacement(text) {
  return text.replace(/\r\n?/g, '\n');
}

export function encodeParagraphReplacement(text) {
  if (typeof text !== 'string' || !text.isWellFormed()) throw new TypeError('InvalidText');
  if (text.length > 4 * 1024 * 1024) throw new RangeError('LimitExceeded');
  const bytes = new TextEncoder().encode(normalizeParagraphReplacement(text));
  if (bytes.length > 4 * 1024 * 1024) throw new RangeError('LimitExceeded');
  return bytes;
}
