import { expect, test } from 'bun:test';
import {
  DEFAULT_SYMBOL_CATEGORY_ID,
  SYMBOL_CATEGORIES,
  getSymbolCategory,
  symbolTextError,
} from '../src/symbol-catalog.ts';
import { createSymbolDialog } from '../src/symbol-dialog-view.ts';
import { all, documentFixture, fire } from './formatting-dialog-test-dom.ts';

test('공식 DOM에서 관측한 16개 이름과 순서를 유지한다', () => {
  expect(SYMBOL_CATEGORIES.map((c) => c.label)).toEqual([
    '일반 문장 부호',
    '기호1',
    '기호2',
    '통화 기호',
    '글자 모양 기호',
    '숫자 형식',
    '화살표',
    '수학 연산자',
    '그리스어',
    '단위기호',
    '원문자',
    '괄호문자',
    '상자 그리기',
    '도형',
    '기타 기호',
    '한중일 기호 및 문장 부호',
  ]);
  expect(new Set(SYMBOL_CATEGORIES.map((c) => c.id)).size).toBe(16);
});
test('안정 ID는 숫자 위치나 객체 prototype 키를 허용하지 않는다', () => {
  for (const id of ['', '0', '1', '__proto__', 'constructor'])
    expect(getSymbolCategory(id)).toBeNull();
  for (const category of SYMBOL_CATEGORIES) expect(getSymbolCategory(category.id)).toBe(category);
  expect(getSymbolCategory(DEFAULT_SYMBOL_CATEGORY_ID)?.label).toBe('일반 문장 부호');
});
test('카탈로그와 중첩 배열은 불변이며 중복 없는 유효 문자열로 한정한다', () => {
  expect(Object.isFrozen(SYMBOL_CATEGORIES)).toBe(true);
  let total = 0;
  for (const category of SYMBOL_CATEGORIES) {
    expect(Object.isFrozen(category)).toBe(true);
    expect(Object.isFrozen(category.values)).toBe(true);
    expect(new Set(category.values).size).toBe(category.values.length);
    expect(category.values.length).toBeGreaterThan(0);
    expect(category.values.length).toBeLessThanOrEqual(261);
    for (const value of category.values) {
      expect(symbolTextError(value)).toBeNull();
      expect(/^\p{C}$/u.test(value)).toBe(false);
    }
    total += category.values.length;
  }
  expect(total).toBe(1621);
});
test('기존 43개 예시와 조합·astral 시퀀스는 손실 없이 남는다', () => {
  const values = new Set(SYMBOL_CATEGORIES.flatMap((c) => c.values));
  for (const value of [
    '※',
    '§',
    '¶',
    '•',
    '○',
    '●',
    '□',
    '■',
    '☆',
    '★',
    '←',
    '↑',
    '→',
    '↓',
    '↔',
    '⇒',
    '⇔',
    '↗',
    '±',
    '×',
    '÷',
    '≠',
    '≤',
    '≥',
    '∞',
    '√',
    '∑',
    '∫',
    '〈',
    '〉',
    '《',
    '》',
    '「',
    '」',
    '₩',
    '€',
    '£',
    '¥',
    'e\u0301',
    '😀',
    '𝄞',
    '👩\u200d💻',
    '🇰🇷',
  ])
    expect(values.has(value)).toBe(true);
});
test('범주 선택은 ID를 사용하고 다른 범주·잘못된 ID에도 입력 버퍼를 지운 적이 없다', () => {
  const f = documentFixture();
  const inserted: string[] = [];
  const view = createSymbolDialog(f.root as any, {
    onInsert: (t) => {
      inserted.push(t);
    },
    onDismiss() {},
  });
  const category = f.role('symbol-category');
  expect(category.value).toBe(DEFAULT_SYMBOL_CATEGORY_ID);
  const input = f.role('symbol-text');
  input.value = '기존';
  fire(input, 'input');
  category.value = 'greek';
  fire(category, 'change');
  const omega = all(f.root).find((n) => n.tagName === 'BUTTON' && n.textContent === 'Ω')!;
  fire(omega, 'click');
  expect(input.value).toBe('기존Ω');
  category.value = '0';
  fire(category, 'change');
  expect(category.value).toBe(DEFAULT_SYMBOL_CATEGORY_ID);
  expect(input.value).toBe('기존Ω');
  expect(inserted).toEqual([]);
  view.destroy();
});
test('한 번에 선택한 범주의 문자만 렌더하고 전체 목록을 DOM에 쌓지 않는다', () => {
  const f = documentFixture();
  const view = createSymbolDialog(f.root as any, { onInsert() {}, onDismiss() {} });
  for (const category of SYMBOL_CATEGORIES) {
    f.role('symbol-category').value = category.id;
    fire(f.role('symbol-category'), 'change');
    const grid = all(f.root).find((n) => n.getAttribute('aria-label') === '기호 선택')!;
    const buttons = all(grid).filter((n) => n.tagName === 'BUTTON');
    expect(buttons.length).toBe(category.values.length);
    expect(buttons.map((n) => n.textContent)).toEqual(category.values);
  }
  view.destroy();
});
