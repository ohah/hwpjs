import { hwpUnitPixels } from './hwp-units.mjs';

// Relative dimensions are hundredths of one percent, not HWPUNIT lengths.
export function resolvePictureSize(geometry, boxes) {
  const dimension = (raw, criterion, axis, absolute, references) => {
    if (!Number.isInteger(raw) || raw <= 0 || raw > 0xffffffff) return null;
    if (criterion === absolute) return hwpUnitPixels(raw);
    if (!Number.isInteger(criterion) || criterion < 0 || criterion >= references.length)
      return null;
    const base = boxes?.[references[criterion]]?.[axis];
    if (!Number.isFinite(base) || base <= 0) return null;
    const value = base * (raw / 10000);
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const width = dimension(geometry?.width, geometry?.widthRelative, 'width', 4, [
    'paper',
    'page',
    'column',
    'paragraph',
  ]);
  const height = dimension(geometry?.height, geometry?.heightRelative, 'height', 2, [
    'paper',
    'page',
  ]);
  return width === null || height === null ? null : { width, height };
}
