/** UI 문자열을 반올림 없이 정수 배수로 바꾼다. 단위 선택·허용 범위는 호출자와 기존 validator가 소유한다. */
export function exactParagraphNumber(raw: string, scale: 1 | 100): number {
  if (raw.length > 64 || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return Number.NaN;
  const negative = raw.startsWith('-');
  const [whole, fraction = ''] = (negative ? raw.slice(1) : raw).split('.');
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt((whole || '0') + fraction) * BigInt(scale);
  if (numerator % denominator !== 0n) return Number.NaN;
  const value = Number(numerator / denominator) * (negative ? -1 : 1);
  return Number.isSafeInteger(value) ? value : Number.NaN;
}
