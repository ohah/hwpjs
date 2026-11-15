import { exactParagraphNumber } from './paragraph-shape-number.ts';
import { pictureMillimeters, pictureSize, pictureUnits } from './object-properties-input.ts';

/** Physical source frame returned by Native, never a Canvas/preview rectangle. */
export interface ObjectGeometryValues {
  readonly width: number;
  readonly height: number;
  readonly horizontalOffset: number;
  readonly verticalOffset: number;
}
export type ObjectGeometryField = keyof ObjectGeometryValues;
export interface ObjectGeometryDraft {
  readonly width: string;
  readonly height: string;
  readonly horizontalOffset: string;
  readonly verticalOffset: string;
  readonly dirty: Readonly<Record<ObjectGeometryField, boolean>>;
}
export type ObjectGeometryPatch = Partial<ObjectGeometryValues>;

function checkedOriginal(original: ObjectGeometryValues) {
  for (const field of ['width', 'height'] as const) pictureMillimeters(original[field]);
  for (const field of ['horizontalOffset', 'verticalOffset'] as const) {
    const value = original[field];
    if (!Number.isSafeInteger(value) || value < -0x80000000 || value > 0x7fffffff)
      throw Error('InvalidObjectOffset');
  }
}
export function objectOffsetMillimeters(units: number): string {
  if (!Number.isSafeInteger(units) || units < -0x80000000 || units > 0x7fffffff)
    throw Error('InvalidObjectOffset');
  return units === 0 ? '0' : `${units < 0 ? '-' : ''}${pictureMillimeters(Math.abs(units))}`;
}
export function objectOffsetUnits(text: string): number {
  if (typeof text !== 'string' || text.length > 40) throw Error('InvalidObjectOffset');
  const value = text.trim();
  const hundredths = exactParagraphNumber(value, 100);
  if (!value || !Number.isSafeInteger(hundredths)) throw Error('InvalidObjectOffset');
  if (hundredths === 0) return 0;
  const negative = hundredths < 0;
  const magnitude = pictureUnits(value.replace(/^[+-]/, ''));
  const units = negative ? -magnitude : magnitude;
  if (units < -0x80000000 || units > 0x7fffffff) throw Error('InvalidObjectOffset');
  return units;
}
export function objectGeometryDraft(original: ObjectGeometryValues): ObjectGeometryDraft {
  checkedOriginal(original);
  return {
    width: pictureMillimeters(original.width),
    height: pictureMillimeters(original.height),
    horizontalOffset: objectOffsetMillimeters(original.horizontalOffset),
    verticalOffset: objectOffsetMillimeters(original.verticalOffset),
    dirty: { width: false, height: false, horizontalOffset: false, verticalOffset: false },
  };
}
/** Sparse intent only. Untouched/unchanged native values never round-trip through display mm. */
export function objectGeometryPatch(
  draft: ObjectGeometryDraft,
  original: ObjectGeometryValues,
): ObjectGeometryPatch {
  checkedOriginal(original);
  const sizes = pictureSize(draft, original);
  const patch: Partial<Record<ObjectGeometryField, number>> = {};
  for (const field of ['width', 'height', 'horizontalOffset', 'verticalOffset'] as const) {
    if (draft.dirty[field] !== true) continue;
    if (
      (field === 'horizontalOffset' || field === 'verticalOffset') &&
      draft[field].trim() === objectOffsetMillimeters(original[field])
    )
      continue;
    const value =
      field === 'width' || field === 'height' ? sizes[field] : objectOffsetUnits(draft[field]);
    if (value !== original[field]) patch[field] = value;
  }
  return patch;
}
