import { hwpUnitPixels } from './hwp-units.mjs';

// Resolve width from current table geometry, not the stored lastWidth cache.
export function tableCaptionWidth(table, rectangle) {
  const caption = table?.sourceCaption;
  if (
    !caption ||
    ![0, 1, 2, 3].includes(caption.side) ||
    !Number.isFinite(rectangle?.width) ||
    rectangle.width <= 0
  )
    return null;
  if (caption.side < 2) {
    if (!Number.isSafeInteger(caption.width) || caption.width <= 0 || caption.width > 0x7fffffff)
      return null;
    return { width: hwpUnitPixels(caption.width), offsetX: 0 };
  }
  if (typeof caption.full_size !== 'boolean') return null;
  if (!caption.full_size) return { width: rectangle.width, offsetX: 0 };
  const margin = table.sourceGeometry?.out_margin;
  if (
    !Array.isArray(margin) ||
    margin.length !== 4 ||
    !margin.every((v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff)
  )
    return null;
  const left = hwpUnitPixels(margin[0]),
    right = hwpUnitPixels(margin[1]);
  const width = rectangle.width + left + right;
  return Number.isFinite(width) ? { width, offsetX: -left } : null;
}
