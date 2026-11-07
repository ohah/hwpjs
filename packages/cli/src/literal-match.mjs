const MAX_LITERAL_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_UNITS = 32 * 1024 * 1024;
const encoder = new TextEncoder();

// A replacement cannot create paragraph boundaries or inject native controls.
// Empty replacement is deletion. CR/LF, NEL, Unicode line/paragraph separators
// and C0 controls (including tab) require a future structural editing command.
export function validateLiteral(value, { empty = false } = {}) {
  if (typeof value !== 'string' || !value.isWellFormed()) throw new TypeError('InvalidLiteralText');
  if (!empty && value.length === 0) throw new Error('EmptySearchText');
  if (value.length > MAX_LITERAL_BYTES || encoder.encode(value).byteLength > MAX_LITERAL_BYTES)
    throw new RangeError('LiteralLimitExceeded');
  // eslint-disable-next-line no-control-regex -- Reject literal native controls before splice.
  if (/[\u0000-\u001f\u0085\u2028\u2029]/u.test(value))
    throw new Error('SingleParagraphTextRequired');
  return value;
}

// KMP over UTF-16 units: O(text.length + literal.length), including overlaps.
// Stop at the second match: no mutation is allowed for an ambiguous search.
export function findUniqueLiteral(text, literal) {
  validateLiteral(literal);
  if (typeof text !== 'string' || !text.isWellFormed()) throw new TypeError('InvalidNativeText');
  if (text.length > MAX_TEXT_UNITS) throw new RangeError('DecodedTextLimitExceeded');
  const prefix = new Uint32Array(literal.length);
  for (let i = 1, j = 0; i < literal.length; i++) {
    while (j && literal[i] !== literal[j]) j = prefix[j - 1];
    if (literal[i] === literal[j]) j++;
    prefix[i] = j;
  }
  let found = -1;
  for (let i = 0, j = 0; i < text.length; i++) {
    while (j && text[i] !== literal[j]) j = prefix[j - 1];
    if (text[i] === literal[j]) j++;
    if (j === literal.length) {
      if (found !== -1) throw new Error('AmbiguousLiteralText');
      found = i + 1 - j;
      j = prefix[j - 1];
    }
  }
  if (found === -1) throw new Error('LiteralTextNotFound');
  return found;
}
