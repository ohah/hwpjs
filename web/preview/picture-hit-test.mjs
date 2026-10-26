import { pictureQuadTransform } from "./picture-quad-transform.mjs";
import { inverseAffine, affinePoint } from "./affine-point-geometry.mjs";
import { pageContainsPoint } from "./page-visible-rectangle.mjs";
import { pointInClosedPath } from "./closed-path-hit-test.mjs";

function contains(item, x, y) {
  if (item.pageClip !== undefined) {
    if (!pageContainsPoint(item.pageClip, x, y)) return false;
  }
  if (item.transform !== undefined) {
    const inverse = inverseAffine(item.transform);
    const point = inverse && affinePoint(inverse, [x, y]);
    if (!point) return false;
    [x, y] = point;
  }
  if (item.paintPlan?.state === "polygon") return pointInClosedPath(item.paintPlan.points, x, y);
  if (item.paintPlan?.state === "quad") {
    const origin = item.paintOrigin ?? { x: item.x, y: item.y };
    const mapped = pictureQuadTransform(item.paintPlan.corners, origin);
    if (mapped.state !== "mapped") return false;
    const [a, b, c, d, e, f] = mapped.matrix;
    const determinant = a * d - b * c;
    const u = (d * (x - e) - c * (y - f)) / determinant;
    const v = (-b * (x - e) + a * (y - f)) / determinant;
    return Number.isFinite(u) && Number.isFinite(v) && u >= 0 && u <= 1 && v >= 0 && v <= 1;
  }
  if (
    item.paintPlan?.state !== "plain" ||
    ![item.x, item.y, item.width, item.height].every(Number.isFinite) ||
    item.width <= 0 ||
    item.height <= 0
  )
    return false;
  return x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height;
}

// Coordinates are logical Canvas pixels, including document scroll offset.
// Behind-text objects require an explicit object-selection gesture.
export function hitPictureLayers(
  layers,
  x,
  y,
  isPainted,
  { includeBehind = false, paintOrder = null } = {},
) {
  if (![x, y].every(Number.isFinite) || typeof isPainted !== "function") return null;
  if (paintOrder !== null) {
    for (let index = paintOrder.length - 1; index >= 0; index--) {
      const record = paintOrder[index];
      if (!contains(record.item, x, y)) continue;
      if (record.kind === "occluder") return null;
      if (record.kind === "picture" && (!record.behind || includeBehind) && isPainted(record.item))
        return record.item;
    }
    return null;
  }
  const order = includeBehind ? [layers.front ?? [], layers.behind ?? []] : [layers.front ?? []];
  for (const list of order) {
    for (let index = list.length - 1; index >= 0; index--) {
      const item = list[index];
      if (isPainted(item) && contains(item, x, y)) return item;
    }
  }
  return null;
}
