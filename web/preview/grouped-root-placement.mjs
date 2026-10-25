import { placeFloatingDrawing, drawingPagePlacementOptions } from "./drawing-placement.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

// Inline groups use the one rectangle reserved by the body paginator. Their
// children never derive another origin from offsets or the viewport.
export function placeGroupedRoot(root, boxes, host, anchor) {
  const fail = error => ({ state: "unavailable", error });
  if (!root || root.group_context !== null) return fail("InvalidRootContainerSource");
  if (root.geometry?.treat_as_character !== true) return placeFloatingDrawing({ source: root }, boxes, drawingPagePlacementOptions);
  if (!host || !anchor || host.section !== anchor.section || host.paragraph !== anchor.paragraph
    || !Number.isSafeInteger(anchor.unit) || !(host.startUnit <= anchor.unit && anchor.unit < host.endUnit)
    || !Number.isSafeInteger(host.pageOrdinal) || host.pageOrdinal < 0) return fail("MissingInlineGroupPlacement");
  if (!Array.isArray(host.inlineGroupPlacements)) return fail("MissingInlineGroupPlacement");
  const matches = host.inlineGroupPlacements.filter(row => row?.objectNode === root.container_node);
  if (matches.length !== 1) return fail("AmbiguousInlineGroupPlacement");
  const placed = matches[0], rectangle = placed.rectangle, geometry = root.geometry;
  if (placed.section !== anchor.section || placed.paragraph !== anchor.paragraph || placed.unit !== anchor.unit
    || placed.pageOrdinal !== host.pageOrdinal || geometry.width_relative !== 4 || geometry.height_relative !== 2
    || ![geometry.width, geometry.height].every(value => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff)
    || !rectangle || ![rectangle.x, rectangle.y, rectangle.width, rectangle.height, rectangle.x + rectangle.width, rectangle.y + rectangle.height].every(Number.isFinite)
    || rectangle.width !== hwpUnitPixels(geometry.width) || rectangle.height !== hwpUnitPixels(geometry.height)) return fail("InvalidInlineGroupPlacement");
  return { state: "placed", rectangle: { ...rectangle } };
}
