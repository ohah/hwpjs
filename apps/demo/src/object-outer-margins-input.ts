import type { ObjectOuterMargins } from '@hwpjs/core';
import { objectOffsetMillimeters, objectOffsetUnits } from './object-geometry-input.ts';
export const outerMarginFields = ['left', 'right', 'top', 'bottom'] as const;
export type OuterMarginField = (typeof outerMarginFields)[number];
export type OuterMarginDraft = Readonly<Record<OuterMarginField, string>>;
const checked = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 32767 || Object.is(value, -0))
    throw Error('InvalidObjectOuterMargin');
  return value;
};
export function outerMarginDraft(original: ObjectOuterMargins): OuterMarginDraft {
  return {
    left: objectOffsetMillimeters(checked(original.left)),
    right: objectOffsetMillimeters(checked(original.right)),
    top: objectOffsetMillimeters(checked(original.top)),
    bottom: objectOffsetMillimeters(checked(original.bottom)),
  };
}
/** Only edited directions convert mm. Rounded labels never replace untouched Native integers. */
export function outerMarginValues(
  draft: OuterMarginDraft,
  dirty: Readonly<Record<OuterMarginField, boolean>>,
  original: ObjectOuterMargins,
): ObjectOuterMargins {
  const labels = outerMarginDraft(original);
  const read = (field: OuterMarginField) => {
    if (!dirty[field] || draft[field].trim() === labels[field]) return original[field];
    if (draft[field].trim().startsWith('-')) throw Error('InvalidObjectOuterMargin');
    return checked(objectOffsetUnits(draft[field]));
  };
  return { left: read('left'), right: read('right'), top: read('top'), bottom: read('bottom') };
}
