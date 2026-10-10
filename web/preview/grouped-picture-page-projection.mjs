import { drawingPageAnchor } from "./drawing-page-anchor.mjs";
import { placeGroupedShape } from "./grouped-shape-placement.mjs";
import { pictureQuadTransform } from "./picture-quad-transform.mjs";
import { groupShapeChildren } from "./group-shape-children.mjs";

export function projectGroupedPicturePage(picture, containers, paragraphs, rows) {
  const unavailable = error => ({ state: "unavailable", error });
  const owner = picture?.owner;
  if (!owner || owner.anchorNode === picture.pictureNode) return unavailable("InvalidGroupedPictureOwner");
  const roots = (containers ?? []).filter(c => c.section === picture.section && c.containerNode === owner.anchorNode);
  if (roots.length !== 1 || roots[0].source.group_context !== null) return unavailable("AmbiguousGroupedPictureRoot");
  const root = roots[0].source;
  let children;
  try { children = groupShapeChildren(root); }
  catch (error) { return unavailable(error.message); }
  if (children.filter(c => c.node === picture.pictureNode && c.kind === "picture").length !== 1) return unavailable("UnsupportedNestedGroupedPicture");
  const transform = picture.transform;
  if (["ownerError", "geometryError", "positionError", "flowError", "cropError", "transformError", "renderingCornersError", "paintError"].some(k => picture[k] != null)
    || !transform || transform.angle !== 0 || (transform.reverse !== false && !(transform.reverse === null && transform.reverseApplicable === false)) || transform.unknownMatrixNodes !== 0 || transform.flip?.length !== 2 || !Array.from(transform.flip).every(v => v === false)
    || picture.crop?.clip?.length !== 4 || !Array.from(picture.crop.clip).every(Number.isFinite)
    || picture.crop.clip[1] <= picture.crop.clip[0] || picture.crop.clip[3] <= picture.crop.clip[2]) return unavailable("UnsupportedGroupedPictureSource");
  const selected = drawingPageAnchor({ section: picture.section, hostParagraph: owner.paragraph, anchorUnit: owner.anchorUnit }, paragraphs, rows);
  if (selected.state !== "selected") return selected;
  const placement = placeGroupedShape(root, picture.renderingCorners, selected.host.referenceBoxes);
  if (placement.state !== "placed") return placement;
  const origin = { x: placement.rectangle.x, y: placement.rectangle.y };
  const mapped = pictureQuadTransform(picture.renderingCorners, origin);
  if (mapped.state !== "mapped") return unavailable(mapped.state);
  const xs = placement.points.map(p => p[0]), ys = placement.points.map(p => p[1]);
  return { state: "placed", origin, rectangle: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
    pageOrdinal: selected.host.pageOrdinal, flow: root.flow, paintPlan: { state: "quad", corners: picture.renderingCorners } };
}
