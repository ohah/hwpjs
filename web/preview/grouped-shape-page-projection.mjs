import { drawingPageAnchor } from "./drawing-page-anchor.mjs";
import { placeGroupedShape } from "./grouped-shape-placement.mjs";

export function projectGroupedShape(drawing, root, paragraphs, pageRows) {
  if (drawing?.source?.group_context?.root_anchor !== root?.container_node) return { state: "unavailable", error: "GroupRootBindingMismatch" };
  const selected = drawingPageAnchor(drawing, paragraphs, pageRows);
  if (selected.state !== "selected") return selected;
  const result = placeGroupedShape(root, drawing.source.rendering_corners, selected.host.referenceBoxes);
  if (result.state !== "placed") return result;
  return { ...result, pageOrdinal: selected.host.pageOrdinal, referenceBoxes: selected.host.referenceBoxes };
}
