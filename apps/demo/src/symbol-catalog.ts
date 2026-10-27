export const SYMBOL_CATEGORIES = Object.freeze(
  [
    { label: '일반', values: ['※', '§', '¶', '•', '○', '●', '□', '■', '☆', '★'] },
    { label: '화살표', values: ['←', '↑', '→', '↓', '↔', '⇒', '⇔', '↗'] },
    { label: '수학', values: ['±', '×', '÷', '≠', '≤', '≥', '∞', '√', '∑', '∫'] },
    { label: '괄호와 통화', values: ['〈', '〉', '《', '》', '「', '」', '₩', '€', '£', '¥'] },
    { label: '확장 문자', values: ['e\u0301', '😀', '𝄞', '👩‍💻', '🇰🇷'] },
  ].map((category) => Object.freeze({ ...category, values: Object.freeze(category.values) })),
);

/** UTF-16 검증은 표준 문자열 API에 맡기며 별도 분절 알고리즘을 만들지 않는다. */
export function symbolTextError(text: string): string | null {
  if (!text.length || text.length > 64) return '1~64 UTF-16 단위의 기호를 선택하세요.';
  const check = (String.prototype as unknown as { isWellFormed?: (this: string) => boolean })
    .isWellFormed;
  if (!check) return '이 환경에서는 문자열 유효성을 확인할 수 없습니다.';
  if (!check.call(text)) return '짝이 맞지 않는 서로게이트는 넣을 수 없습니다.';
  for (const scalar of text) {
    const value = scalar.codePointAt(0)!;
    if (value <= 31 || (value >= 127 && value <= 159))
      return '제어 문자와 줄 바꿈은 넣을 수 없습니다.';
  }
  return null;
}
