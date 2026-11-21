import type { ObjectOuterMargins } from '@hwpjs/core';
import { objectOffsetMillimeters } from './object-geometry-input.ts';
export const outerMarginFields = ['left', 'right', 'top', 'bottom'] as const;
export type OuterMarginField = (typeof outerMarginFields)[number];
export type OuterMarginDraft = Readonly<Record<OuterMarginField, string>>;
export type OuterMarginFormat = 'hwp5' | 'hwpx';
const checked = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 32767 || Object.is(value, -0))
    throw Error('InvalidObjectOuterMargin');
  return value;
};
const observed = (value: number, format: OuterMarginFormat) => {
  if (format === 'hwpx') return checked(value);
  if (
    format !== 'hwp5' ||
    !Number.isSafeInteger(value) ||
    value < -32768 ||
    value > 32767 ||
    Object.is(value, -0)
  )
    throw Error('InvalidObjectOuterMargin');
  return value;
};
/** Margin-only exact decimal parser. 1 HWPUNIT = 127/36000 mm. */
export function outerMarginUnits(raw: string): number {
  if (typeof raw !== 'string' || raw.length > 40) throw Error('InvalidObjectOuterMargin');
  const text = raw.trim();
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) throw Error('InvalidObjectOuterMargin');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const exact = fraction.replace(/0+$/, '');
  if (exact.length > 3) throw Error('InvalidObjectOuterMargin');
  const thousandths = BigInt(whole || '0') * 1000n + BigInt(exact.padEnd(3, '0'));
  const magnitude = (thousandths * 36n + 63n) / 127n;
  const value = Number(magnitude) * (negative && magnitude !== 0n ? -1 : 1);
  return observed(value, 'hwp5');
}
/** Keep existing labels when exact; use three places only to preserve a Native integer. */
export function outerMarginMillimeters(units: number): string {
  observed(units, 'hwp5');
  const legacy = objectOffsetMillimeters(units);
  try {
    if (outerMarginUnits(legacy) === units) return legacy;
  } catch {
    /* Boundary rounding may exceed i16. */
  }
  const thousandths = (BigInt(Math.abs(units)) * 127n + 18n) / 36n;
  const whole = thousandths / 1000n;
  const fraction = String(thousandths % 1000n)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return `${units < 0 ? '-' : ''}${whole}${fraction ? '.' + fraction : ''}`;
}
export function outerMarginDraft(
  original: ObjectOuterMargins,
  format: OuterMarginFormat = 'hwpx',
): OuterMarginDraft {
  return {
    left: outerMarginMillimeters(observed(original.left, format)),
    right: outerMarginMillimeters(observed(original.right, format)),
    top: outerMarginMillimeters(observed(original.top, format)),
    bottom: outerMarginMillimeters(observed(original.bottom, format)),
  };
}
/** Only edited directions convert mm. Rounded labels never replace untouched Native integers. */
export function outerMarginValues(
  draft: OuterMarginDraft,
  dirty: Readonly<Record<OuterMarginField, boolean>>,
  original: ObjectOuterMargins,
  format: OuterMarginFormat = 'hwpx',
): ObjectOuterMargins {
  const labels = outerMarginDraft(original, format);
  const read = (field: OuterMarginField) => {
    if (!dirty[field] || draft[field].trim() === labels[field]) return checked(original[field]);
    if (draft[field].trim().startsWith('-')) throw Error('InvalidObjectOuterMargin');
    return checked(outerMarginUnits(draft[field]));
  };
  return { left: read('left'), right: read('right'), top: read('top'), bottom: read('bottom') };
}
