import { affinePoint, inverseAffine } from "./affine-point-geometry.mjs";
import { rowPageClipContains } from "./row-page-clip.mjs";
export function hitTransformedBox(boxes, x, y) {
  if (![x, y].every(Number.isFinite)) return null;
  for (const box of boxes.toReversed()) {
    if (!rowPageClipContains(box, x, y)) continue;
    const local = box.transform === undefined ? [x, y] : affinePoint(inverseAffine(box.transform), [x, y]);
    if (local && local[0] >= box.x && local[0] < box.x + box.width && local[1] >= box.y && local[1] < box.y + box.height) return box;
  }
  return null;
}
