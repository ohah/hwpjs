import { layoutFloatingDrawingContent } from "./drawing-content-layout.mjs";
import { drawingPageReference } from "./drawing-page-reference.mjs";

// 현재 UTF-16 앵커가 포함된 본문 행의 페이지 기준 영역을 사용합니다.
export function projectFloatingDrawing(drawing, paragraphs, declaration, pageRows, measure, options) {
  const selected = drawingPageReference(drawing, paragraphs, pageRows);
  if (selected.state !== "selected") return selected;
  const host = selected.host;
  const result = layoutFloatingDrawingContent(drawing, paragraphs, declaration, selected.boxes, measure, options);
  if (result.state !== "placed") return result;
  return { ...result, pageOrdinal: host.pageOrdinal, rows: result.rows.map(row => ({ ...row, pageOrdinal: host.pageOrdinal, referenceBoxes: host.referenceBoxes })) };
}
