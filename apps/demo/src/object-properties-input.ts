import { exactParagraphNumber } from './paragraph-shape-number.ts';
// @ts-ignore Canonical HWPUNIT conversion, also used by picture layout/measurement.
import { hwpUnitPixels } from '../../../web/preview/hwp-units.mjs';
/** Display mm is rounded. Only explicitly edited fields are converted back. */
export const pictureDimensionMaximum = 0xffffffff;
export interface PictureSizeDraft {
  readonly width: string;
  readonly height: string;
  readonly dirty?: Readonly<{ width: boolean; height: boolean }>;
  readonly aspectRatio?: 'width' | 'height';
}
export function pictureMillimeters(units: number): string {
  if (!Number.isSafeInteger(units) || units < 1 || units > pictureDimensionMaximum)
    throw Error('InvalidPictureDimension');
  return String(Math.round(((hwpUnitPixels(units) * 25.4) / 96) * 100) / 100);
}
export function pictureUnits(text: string): number {
  if (typeof text !== 'string' || text.length > 40) throw Error('InvalidPictureDimension');
  const value = text.trim();
  const hundredthMm = exactParagraphNumber(value, 100);
  if (!value || !Number.isSafeInteger(hundredthMm) || hundredthMm <= 0)
    throw Error('InvalidPictureDimension');
  const units = Math.round((hundredthMm * 96) / 2540 / hwpUnitPixels(1));
  if (!Number.isSafeInteger(units) || units < 1 || units > pictureDimensionMaximum)
    throw Error('InvalidPictureDimension');
  return units;
}
export function pictureSize(draft: PictureSizeDraft, original?: { width: number; height: number }) {
  const result = {
    width:
      original && (draft.dirty?.width === false || draft.aspectRatio === 'height')
        ? original.width
        : pictureUnits(draft.width),
    height:
      original && (draft.dirty?.height === false || draft.aspectRatio === 'width')
        ? original.height
        : pictureUnits(draft.height),
  };
  if (original && draft.aspectRatio) {
    const changed = draft.aspectRatio;
    const other = changed === 'width' ? 'height' : 'width';
    const from = BigInt(original[changed]);
    if (from <= 0n) throw Error('InvalidPictureDimension');
    const units = Number((BigInt(result[changed]) * BigInt(original[other]) + from / 2n) / from);
    pictureMillimeters(units);
    result[other] = units;
  }
  return result;
}
/** Only dialog draft data. No geometry, Native target or reference is generated. */
export function proportionalPictureSize(
  changed: 'width' | 'height',
  value: string,
  original: { width: number; height: number },
): PictureSizeDraft {
  const amount = pictureUnits(value);
  // Validate both original dimensions rather than guessing missing/zero sizes.
  pictureMillimeters(original.width);
  pictureMillimeters(original.height);
  const from = BigInt(original[changed]);
  const other = changed === 'width' ? 'height' : 'width';
  const scaled = Number((BigInt(amount) * BigInt(original[other]) + from / 2n) / from);
  return {
    [changed]: pictureMillimeters(amount),
    [other]: pictureMillimeters(scaled),
  } as unknown as PictureSizeDraft;
}
