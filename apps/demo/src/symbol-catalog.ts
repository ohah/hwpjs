import { SYMBOL_CATEGORY_DATA } from './symbol-category-data.ts';

export const SYMBOL_CATEGORIES = SYMBOL_CATEGORY_DATA;
export const DEFAULT_SYMBOL_CATEGORY_ID = 'general-punctuation';
const categoryById = new Map(SYMBOL_CATEGORIES.map((category) => [category.id, category]));

/** 공유 Map을 노출하지 않고 안정 ID만 조회한다. */
export function getSymbolCategory(id: string) {
  return categoryById.get(id) ?? null;
}

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
