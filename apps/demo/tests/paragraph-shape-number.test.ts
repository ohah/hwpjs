import { test, expect } from 'bun:test';
import { createParagraphShapeView } from '../src/paragraph-shape-view.ts';
import { exactParagraphNumber } from '../src/paragraph-shape-number.ts';
import { expectRawDecimal, expectExactFraction } from './paragraph-shape-number-fixture.ts';
test('입력 중 소수점은 원시 문자열로 유지한다', () => expectRawDecimal(createParagraphShapeView));
test('정확한 소수 입력을 부동소수 오차로 거부하지 않는다', () =>
  expectExactFraction(createParagraphShapeView));
test('변환은 정확한 정수 배수만 허용하며 범위 밖과 잘못된 숫자는 거부한다', () => {
  for (const [raw, value] of [
    ['1.03', 103],
    ['-1.03', -103],
    ['.5', 50],
    ['1.0300', 103],
  ] as const)
    expect(exactParagraphNumber(raw, 100)).toBe(value);
  expect(exactParagraphNumber('160.00', 1)).toBe(160);
  for (const raw of ['0.001', '-', '1e3', 'Infinity', 'NaN', ' 1', '9'.repeat(65)])
    expect(Number.isNaN(exactParagraphNumber(raw, 100))).toBe(true);
  expect(Number.isNaN(exactParagraphNumber('160.01', 1))).toBe(true);
});
