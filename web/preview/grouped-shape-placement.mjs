import { placeGroupedRoot } from "./grouped-root-placement.mjs";
import { groupedShapePagePoints } from "./grouped-shape-page-points.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

/** Only a root container defines the page origin; nested sources stay structural. */
export function placeGroupedShape(root, corners, boxes, context = {}) {
  if (!root || root.group_context !== null)
    return { state: "unavailable", error: "InvalidRootContainerSource" };
  const placement = placeGroupedRoot(root, boxes, context.host, context.anchor);
  if (placement.state !== "placed") return placement;
  try {
    const { x, y } = placement.rectangle;
    return { ...placement, points: groupedShapePagePoints(corners, [x, y], hwpUnitPixels(1)) };
  } catch (error) {
    return { state: "unavailable", error: error.message };
  }
}
