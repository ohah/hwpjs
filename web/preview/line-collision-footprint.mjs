import { linePaintPoints } from "./line-paint.mjs";
import { decoratedLineBounds } from "./decorated-line-bounds.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

/** Bounds use the existing painter coordinates; page ownership must be explicit. */
export function lineCollisionFootprint(line, placement) {
  if (!Number.isSafeInteger(line?.section) || line.section < 0 || !Number.isSafeInteger(line.lineNode) || line.lineNode < 0
    || !Number.isSafeInteger(placement?.pageOrdinal) || placement.pageOrdinal < 0
    || ![placement.origin?.x, placement.origin?.y].every(Number.isFinite)) return null;
  const margins = line.placement?.flow?.outsideMargins;
  if (!Array.isArray(margins) || margins.length !== 4 || !margins.every(v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff)) return null;
  let bounds;
  if (line.state === "reference_located") {
    const local = decoratedLineBounds(line.referencePlan);
    if (!local) return null;
    bounds = { left: placement.origin.x + local.left, right: placement.origin.x + local.right,
      top: placement.origin.y + local.top, bottom: placement.origin.y + local.bottom };
  } else if (line.state === "located") {
    const points = linePaintPoints(line, placement.origin);
    if (!points) return null;
    const half = hwpUnitPixels(line.stroke.width) / 2;
    bounds = { left: Math.min(points[0][0], points[1][0]) - half, right: Math.max(points[0][0], points[1][0]) + half,
      top: Math.min(points[0][1], points[1][1]) - half, bottom: Math.max(points[0][1], points[1][1]) + half };
  } else return null;
  const [left, right, top, bottom] = margins.map(hwpUnitPixels);
  const rectangle = { x: bounds.left - left, y: bounds.top - top,
    width: bounds.right - bounds.left + left + right, height: bounds.bottom - bounds.top + top + bottom };
  if (![rectangle.x, rectangle.y, rectangle.width, rectangle.height, rectangle.x + rectangle.width, rectangle.y + rectangle.height].every(Number.isFinite)
    || rectangle.width <= 0 || rectangle.height <= 0) return null;
  return { kind: "line", section: line.section, node: line.lineNode, pageOrdinal: placement.pageOrdinal, rectangle };
}
