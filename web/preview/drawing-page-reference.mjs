import { drawingPageAnchor } from "./drawing-page-anchor.mjs";
import { nestedParagraphReference } from "./nested-paragraph-reference.mjs";

// 예약과 실제 도형 배치는 같은 현재 앵커·문단 기준 영역을 사용합니다.
export function drawingPageReference(drawing, paragraphs, pageRows) {
  const selected = drawingPageAnchor(drawing, paragraphs, pageRows);
  if (selected.state !== "selected") return selected;
  const host = selected.host, relations = drawing.source?.position?.relations;
  let boxes = host.referenceBoxes;
  if (relations?.[0] === 2 || relations?.[1] === 3) {
    const owner = paragraphs.find(row => row.section === drawing.section && row.paragraph === drawing.hostParagraph);
    const anchoredRows = drawing.source?.flow?.text_wrap === 1 && relations?.[2] === 0
      ? pageRows.map(row => row.section === drawing.section && row.paragraph === drawing.hostParagraph && row.flowAnchorY !== undefined
        ? { ...row, y: row.flowAnchorY } : row) : pageRows;
    const reference = nestedParagraphReference(owner, { rows: anchoredRows }, { x: 0, y: 0 },
      { pageOrdinal: host.pageOrdinal, columnOrdinal: host.columnOrdinal });
    if (reference.state !== "referenced") return { state: "unavailable", error: "MissingDrawingParagraphReference", referenceError: reference.error };
    boxes = { ...boxes, paragraph: reference.rectangle };
  }
  return { state: "selected", host, boxes };
}
