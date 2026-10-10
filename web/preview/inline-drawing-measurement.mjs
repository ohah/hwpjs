import { layoutDrawingText } from "./drawing-text-layout.mjs";
import { drawingAxisGeometry } from "./drawing-axis-geometry.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

// 원본 내부 단 높이로 텍스트를 측정하고 본문이 예약할 높이를 분리합니다.
export function measureInlineDrawingContent(drawing, paragraphs, declaration, measure, { maxRows = 20000 } = {}) {
  const source = drawing?.source;
  const unavailable = error => ({ state: "unavailable", error });
  if (!Array.isArray(paragraphs)) return unavailable("InvalidInlineDrawingMeasurement");
  if (!drawingAxisGeometry(source) || source.geometry.treat_as_character !== true || source.caption) return unavailable("UnsupportedInlineDrawingMeasurement");
  const rectangle = { x: 0, y: 0, width: hwpUnitPixels(source.geometry.width), height: hwpUnitPixels(source.geometry.height) };
  const members = paragraphs.filter(paragraph => paragraph.section === drawing.section && paragraph.drawingText?.drawingNode === drawing.drawingNode);
  const text = layoutDrawingText(drawing, members, declaration, rectangle, measure, { maxRows, compactLines: true, overflow: "extend-last-column" });
  if (text.state !== "placed") return text;
  const height = Math.max(rectangle.height, text.textBounds.y + text.textBounds.height + hwpUnitPixels(source.text.margins[3]));
  if (!Number.isFinite(height) || height <= 0) return unavailable("InvalidInlineDrawingMeasurement");
  return { state: "measured", section: drawing.section, drawingNode: drawing.drawingNode, width: rectangle.width, height, sourceRectangle: rectangle, text };
}
