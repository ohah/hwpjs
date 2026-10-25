import { hwpUnitPixels } from "./hwp-units.mjs";

/** Shared conservative collision footprint for known nonnegative outer margins. */
export function objectCollisionBox(rectangle, margins) {
  const valid = box => box && [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite)
    && box.width > 0 && box.height > 0;
  if (!valid(rectangle) || !Array.isArray(margins) || margins.length !== 4
    || !margins.every(value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff)) return null;
  const [left, right, top, bottom] = margins.map(hwpUnitPixels);
  const box = { x: rectangle.x - left, y: rectangle.y - top, width: rectangle.width + left + right, height: rectangle.height + top + bottom };
  return valid(box) ? box : null;
}
