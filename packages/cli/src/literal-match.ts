const MAX_LITERAL_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_UNITS = 32 * 1024 * 1024;
const encoder = new TextEncoder();

// 일반 치환은 문단 경계나 Native 제어문자를 만들지 않습니다.
// 빈 치환은 삭제이며 줄바꿈과 제어문자는 별도 구조 편집 경로를 사용합니다.
export function validateLiteral(
  value: unknown,
  { empty = false }: { empty?: boolean } = {},
): string {
  if (typeof value !== 'string' || !value.isWellFormed()) throw new TypeError('InvalidLiteralText');
  if (!empty && value.length === 0) throw new Error('EmptySearchText');
  if (value.length > MAX_LITERAL_BYTES || encoder.encode(value).byteLength > MAX_LITERAL_BYTES)
    throw new RangeError('LiteralLimitExceeded');
  // eslint-disable-next-line no-control-regex -- Native 제어문자를 splice 전에 거부합니다.
  if (/[\u0000-\u001f\u0085\u2028\u2029]/u.test(value))
    throw new Error('SingleParagraphTextRequired');
  return value;
}

// 겹치는 일치를 포함한 UTF16 KMP이며 모호한 두 번째 일치에서 중단합니다.
export function findUniqueLiteral(text: unknown, inputLiteral: unknown): number {
  const literal = validateLiteral(inputLiteral);
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
