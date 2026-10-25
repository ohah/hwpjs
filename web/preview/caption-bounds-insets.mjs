import { tableInsets } from "./table-insets.mjs";

// Union caption bounds with existing outer space, never reserve either twice.
export function captionBoundsInsets(rectangle, bounds, outerInsets) {
  const margins = tableInsets(outerInsets);
  if (!margins || !rectangle || !bounds || ![rectangle, bounds].every(box =>
    [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite)
    && box.width > 0 && box.height >= 0)) return null;
  const reserved = {
    left: Math.max(margins.left, rectangle.x - bounds.x),
    right: Math.max(margins.right, bounds.x + bounds.width - (rectangle.x + rectangle.width)),
    top: Math.max(margins.top, rectangle.y - bounds.y),
    bottom: Math.max(margins.bottom, bounds.y + bounds.height - (rectangle.y + rectangle.height)),
  };
  return Object.values(reserved).every(value => Number.isFinite(value) && value >= 0) ? reserved : null;
}
