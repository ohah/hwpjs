import { layoutDrawingText } from "./drawing-text-layout.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { validateHwp5DrawingListSources } from "../../js/hwp5-drawing-list-sources.mjs";
import { hwp5DrawingTextSource } from "./hwp5-drawing-text-source.mjs";

// 호출자가 정한 영역에서 현재 본문만 측정합니다. 도형/행렬 위치는 결정하지 않습니다.
export function measureHwp5DrawingBody(
  content,
  body,
  rectangle,
  declaration,
  measure,
  maxRows = 20000,
) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (
    content?.limited ||
    content?.hwp5DrawingBodyErrors?.length ||
    body?.kind !== "body" ||
    !Array.isArray(body.paragraphs) ||
    !body.source ||
    !Array.isArray(body.source.margins) ||
    !content.hwp5DrawingBodies?.includes(body)
  )
    return unavailable("InvalidHwp5DrawingBodyMeasurement");
  try {
    validateHwp5DrawingListSources([body.source]);
  } catch {
    return unavailable("InvalidHwp5DrawingBodyMeasurement");
  }
  if (
    body.source.kind !== "body" ||
    body.source.control_node !== body.controlNode ||
    body.source.owner_node !== body.ownerNode ||
    body.source.list_node !== body.listNode
  )
    return unavailable("Hwp5DrawingBodySourceMismatch");
  const selected = [];
  for (const id of body.paragraphs) {
    const matches = content.paragraphs.filter(
      (row) => row.section === body.section && row.paragraph === id,
    );
    if (
      matches.length !== 1 ||
      matches[0].clipped ||
      matches[0].tableCell ||
      matches[0].tableCaption
    )
      return unavailable("InvalidHwp5DrawingBodyParagraph");
    // 임시 표시 소유권은 저장 모델을 변경하지 않습니다.
    selected.push({
      ...matches[0],
      drawingText: { drawingNode: body.ownerNode, listNode: body.listNode },
    });
  }
  if (new Set(body.paragraphs).size !== body.paragraphs.length)
    return unavailable("AmbiguousHwp5DrawingBodyParagraph");
  let text;
  try {
    text = hwp5DrawingTextSource(body.source);
  } catch (error) {
    return unavailable(error.message);
  }
  const drawing = { section: body.section, drawingNode: body.ownerNode, source: { text } };
  const result = layoutDrawingText(drawing, selected, declaration, rectangle, measure, { maxRows });
  if (result.state !== "placed") return result;
  const coverage = pageParagraphCoverage(selected, result.rows);
  if (coverage.state !== "complete") return coverage;
  return {
    ...result,
    state: "measured",
    controlNode: body.controlNode,
    ownerNode: body.ownerNode,
    listNode: body.listNode,
  };
}
