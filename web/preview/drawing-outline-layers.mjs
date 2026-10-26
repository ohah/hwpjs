import { placeFloatingDrawing, drawingPagePlacementOptions } from "./drawing-placement.mjs";
import { drawingOutlinePoints } from "./drawing-outline-paint.mjs";
import { signedInt32 } from "./signed-int32.mjs";
import { drawingRotatedGeometry } from "./drawing-rotated-geometry.mjs";
import { drawingRootSource } from "./drawing-text-page-projection.mjs";
import { projectGroupedRectangle } from "./grouped-rectangle-page-projection.mjs";
import { groupedPaintLayer } from "./grouped-paint-layer.mjs";

// 테두리 계층만 조합합니다. 내부 텍스트·채우기 완료 여부와 분리합니다.
export function previewDrawingOutlineLayers(content, layout) {
  const result = { behind: [], front: [], unavailable: [], height: layout.height };
  for (const drawing of content.drawings ?? []) {
    const reject = (error) =>
      result.unavailable.push({
        section: drawing.section,
        drawingNode: drawing.drawingNode,
        error,
      });
    const source = drawing.source;
    if (source?.stroke?.style === 0) continue;
    if (source?.group_context) {
      const root = drawingRootSource(drawing, content.containers);
      if (root.state !== "selected") {
        reject(root.error);
        continue;
      }
      const order = signedInt32(root.source.flow?.z_order);
      // Keep the original optional property read, including a possible getter.
      void root.source.flow?.text_wrap;
      const layer = groupedPaintLayer(root.source);
      if (order === null || layer === null) {
        reject("UnsupportedDrawingOutlineFlow");
        continue;
      }
      const placement = projectGroupedRectangle(
        drawing,
        root.source,
        content.paragraphs,
        layout.rows,
      );
      if (placement.state !== "placed") {
        reject(placement.error ?? placement.state);
        continue;
      }
      const points = drawingOutlinePoints(source, placement.origin);
      if (!points) {
        reject("UnsupportedDrawingOutlineStroke");
        continue;
      }
      result[layer].push({ drawing, origin: placement.origin, zOrder: order });
      result.height = Math.max(result.height, ...points.map((p) => p[1]));
      continue;
    }
    const owner = content.paragraphs.filter(
      (p) => p.section === drawing.section && p.paragraph === drawing.hostParagraph,
    );
    if (owner.length !== 1 || owner[0].text?.[drawing.anchorUnit] !== "\ufffc") {
      reject("InvalidDrawingPageAnchor");
      continue;
    }
    const hosts = layout.rows.filter(
      (row) =>
        row.kind === "text" &&
        row.section === drawing.section &&
        row.paragraph === drawing.hostParagraph &&
        row.startUnit <= drawing.anchorUnit &&
        drawing.anchorUnit < row.endUnit,
    );
    if (hosts.length !== 1) {
      reject("AmbiguousDrawingPageAnchor");
      continue;
    }
    const inline = source?.geometry?.treat_as_character === true;
    if (
      (source?.rendering?.angle !== 0 && !drawingRotatedGeometry(source)) ||
      !Array.isArray(source.rendering.flip) ||
      source.rendering.flip.length !== 2 ||
      !source.rendering.flip.every((v) => v === false) ||
      source.rendering.reverse === true
    ) {
      reject("UnsupportedDrawingOutlineTransform");
      continue;
    }
    const zOrder = signedInt32(source.flow?.z_order),
      wrap = source.flow?.text_wrap;
    if (zOrder === null || !(inline ? wrap === 0 : [2, 3].includes(wrap))) {
      reject("UnsupportedDrawingOutlineFlow");
      continue;
    }
    const current = (layout.placedDrawings ?? []).filter(
      (item) =>
        item.section === drawing.section &&
        item.drawingNode === drawing.drawingNode &&
        item.hostParagraph === drawing.hostParagraph &&
        item.anchorUnit === drawing.anchorUnit &&
        item.pageOrdinal === hosts[0].pageOrdinal,
    );
    if (inline && current.length !== 1) {
      reject("AmbiguousInlineDrawingOutline");
      continue;
    }
    if (current.length > 1) {
      reject("AmbiguousDrawingOutlinePlacement");
      continue;
    }
    if (
      !current.length &&
      !inline &&
      (source?.position?.relations?.[0] === 2 || source?.position?.relations?.[1] === 3)
    ) {
      reject("MissingDrawingParagraphReference");
      continue;
    }
    const placement =
      current.length === 1
        ? { state: "placed", rectangle: current[0].rectangle }
        : placeFloatingDrawing(drawing, hosts[0].referenceBoxes, drawingPagePlacementOptions);
    if (placement.state !== "placed") {
      reject(placement.state);
      continue;
    }
    const points = drawingOutlinePoints(source, placement.rectangle);
    if (!points) {
      reject("UnsupportedDrawingOutlineStroke");
      continue;
    }
    result[wrap === 2 ? "behind" : "front"].push({ drawing, origin: placement.rectangle, zOrder });
    result.height = Math.max(result.height, ...points.map((p) => p[1]));
  }
  for (const list of [result.behind, result.front]) list.sort((a, b) => a.zOrder - b.zOrder);
  return result;
}
