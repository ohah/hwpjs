import { layoutFloatingDrawingContent } from "./drawing-content-layout.mjs";
import { drawingPageAnchor } from "./drawing-page-anchor.mjs";

// 현재 UTF-16 앵커가 포함된 본문 행의 페이지 기준 영역을 사용합니다.
export function projectFloatingDrawing(drawing, paragraphs, declaration, pageRows, measure, options) {
  const unavailable = error => ({ state: "unavailable", error });
  const selected = drawingPageAnchor(drawing, paragraphs, pageRows);
  if (selected.state !== "selected") return selected;
  const host = selected.host;
  const relations = drawing.source?.position?.relations;
  if (relations?.[0] === 2 || relations?.[1] === 3) return unavailable("MissingDrawingParagraphReference");
  const boxes = host.referenceBoxes;
  const result = layoutFloatingDrawingContent(drawing, paragraphs, declaration, boxes, measure, options);
  if (result.state !== "placed") return result;
  return { ...result, pageOrdinal: host.pageOrdinal, rows: result.rows.map(row => ({ ...row, pageOrdinal: host.pageOrdinal, referenceBoxes: host.referenceBoxes })) };
}
