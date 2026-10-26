import { ellipseRenderingGeometry } from "./ellipse-rendering-geometry.mjs";
import { drawingPageReference } from "./drawing-page-reference.mjs";
import { placeFloatingDrawing, drawingPagePlacementOptions } from "./drawing-placement.mjs";
import { signedInt32 } from "./signed-int32.mjs";

export function projectEllipsePage(section, row, paragraphs, rows) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    !Number.isSafeInteger(section) ||
    section < 0 ||
    row?.sourceOnly !== true ||
    !Number.isSafeInteger(row.node) ||
    row.node < 0 ||
    row.owner?.anchor_node !== row.node ||
    !Number.isSafeInteger(row.owner.paragraph) ||
    row.owner.paragraph < 1
  )
    return fail("UnsupportedEllipseOwner");
  const source = row.common,
    order = signedInt32(source?.flow?.z_order);
  if (
    source?.geometry?.treat_as_character !== false ||
    ![2, 3].includes(source?.flow?.text_wrap) ||
    order === null
  )
    return fail("UnsupportedEllipsePagePolicy");
  const geometry = ellipseRenderingGeometry(row);
  if (geometry.state !== "resolved") return geometry;
  const drawing = {
    section,
    drawingNode: row.node,
    hostParagraph: row.owner.paragraph - 1,
    anchorUnit: row.owner.anchor_unit,
    source,
  };
  const selected = drawingPageReference(drawing, paragraphs, rows);
  if (selected.state !== "selected") return selected;
  const placement = placeFloatingDrawing(drawing, selected.boxes, drawingPagePlacementOptions);
  if (placement.state !== "placed") return fail(placement.state);
  const origin = placement.rectangle,
    center = [geometry.center[0] + origin.x, geometry.center[1] + origin.y];
  const bounds = {
    ...geometry.bounds,
    x: geometry.bounds.x + origin.x,
    y: geometry.bounds.y + origin.y,
  };
  if (![...center, ...Object.values(bounds)].every(Number.isFinite))
    return fail("InvalidEllipsePageBounds");
  return {
    state: "placed",
    section,
    node: row.node,
    paragraph: drawing.hostParagraph,
    anchorUnit: drawing.anchorUnit,
    pageOrdinal: selected.host.pageOrdinal,
    layer: source.flow.text_wrap === 2 ? "behind" : "front",
    zOrder: order,
    center,
    u: geometry.u,
    v: geometry.v,
    bounds,
  };
}
