import { drawingPageReference } from './drawing-page-reference.mjs';
import { placeFloatingDrawing, drawingPagePlacementOptions } from './drawing-placement.mjs';
import { drawingAxisGeometry } from './drawing-axis-geometry.mjs';
import { drawingFillPlan } from './drawing-fill-plan.mjs';
import { drawingOutlinePoints } from './drawing-outline-paint.mjs';
import { signedInt32 } from './signed-int32.mjs';
import { projectGroupedRectangle } from './grouped-rectangle-page-projection.mjs';
import { groupedPaintLayer } from './grouped-paint-layer.mjs';
import { drawingHasNoShadow } from './drawing-shadow-policy.mjs';

export function previewRectangleLayers(content, layout) {
  const result = { behind: [], front: [], unavailable: [] };
  const textNodes = new Set((content.drawings ?? []).map((d) => `${d.section}:${d.drawingNode}`));
  for (const drawing of [...(content.rectangles ?? []), ...(content.polygons ?? [])]) {
    if (textNodes.has(`${drawing.section}:${drawing.drawingNode}`)) continue;
    const reject = (error) =>
      result.unavailable.push({
        section: drawing.section,
        drawingNode: drawing.drawingNode,
        error,
      });
    const source = drawing.source;
    const grouped = source.group_context !== null;
    const roots = grouped
      ? (content.containers ?? []).filter(
          (c) =>
            c.section === drawing.section && c.containerNode === source.group_context.root_anchor,
        )
      : [];
    if (grouped && roots.length !== 1) {
      reject('AmbiguousRectangleGroupRoot');
      continue;
    }
    const root = roots[0]?.source;
    const flow = grouped ? root.flow : source.flow;
    const layer = grouped
      ? groupedPaintLayer(root)
      : flow.text_wrap === 2
        ? 'behind'
        : flow.text_wrap === 3
          ? 'front'
          : null;
    if (
      (!grouped && !drawingAxisGeometry(source)) ||
      !drawingHasNoShadow(source.paint) ||
      layer === null
    ) {
      reject('UnsupportedRectangleLayerPolicy');
      continue;
    }
    const zOrder = signedInt32(flow.z_order);
    if (zOrder === null) {
      reject('MissingRectanglePaintOrder');
      continue;
    }
    const selected = drawingPageReference(drawing, content.paragraphs, layout.rows);
    if (selected.state !== 'selected') {
      reject(selected.error);
      continue;
    }
    const placement = grouped
      ? projectGroupedRectangle(drawing, root, content.paragraphs, layout.rows)
      : placeFloatingDrawing(drawing, selected.boxes, drawingPagePlacementOptions);
    if (placement.state !== 'placed') {
      reject(placement.state);
      continue;
    }
    const fill = drawingFillPlan(content, drawing);
    if (fill.state === 'unavailable') {
      reject(fill.error);
      continue;
    }
    const origin = placement.origin ?? placement.rectangle;
    if (source.stroke?.style !== 0 && !drawingOutlinePoints(source, origin)) {
      reject(source.stroke_error ?? 'UnsupportedRectangleOutline');
      continue;
    }
    result[layer].push({
      drawing,
      rectangle: placement.rectangle,
      origin,
      fill,
      zOrder,
      pageOrdinal: selected.host.pageOrdinal,
    });
  }
  for (const list of [result.behind, result.front]) list.sort((a, b) => a.zOrder - b.zOrder);
  return result;
}
