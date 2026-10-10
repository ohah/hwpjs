import { placeFloatingDrawing } from "./drawing-placement.mjs";
import { layoutDrawingText } from "./drawing-text-layout.mjs";
import { layoutDrawingCaption } from "./drawing-caption-layout.mjs";
import { layoutTransformedDrawingText } from "./drawing-transformed-text-layout.mjs";
import { drawingScaledGeometry } from "./drawing-scaled-geometry.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { drawingAxisGeometry } from "./drawing-axis-geometry.mjs";

// 기준 영역과 내부 단 선언은 호출자가 제공합니다.
export function layoutFloatingDrawingContent(drawing, paragraphs, declaration, boxes, measure, { maxRows = 20000, edgePolicy, overflow = "reject" } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Array.isArray(paragraphs) || !Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("InvalidDrawingContentLayout");
  const placement = placeFloatingDrawing(drawing, boxes, { edgePolicy });
  if (placement.state !== "placed") return unavailable(placement.state);
  const members = paragraphs.filter(p => p.section === drawing.section && p.drawingText?.drawingNode === drawing.drawingNode);
  if (new Set(members.map(p => p.paragraph)).size !== members.length) return unavailable("AmbiguousDrawingTextParagraph");
  const captionMembers = paragraphs.filter(p => p.section === drawing.section && p.drawingCaption?.drawingNode === drawing.drawingNode);
  if (!drawing.source.caption && captionMembers.length) return unavailable("DrawingCaptionSourceMismatch");
  const scaled = !drawingAxisGeometry(drawing.source) && drawingScaledGeometry(drawing.source);
  if (drawing.source.text === null && members.length) return unavailable("DrawingTextDisplayBindingMismatch");
  const text = drawing.source.text === null ? { state: "placed", rows: [], limited: false } : drawing.source.rendering?.angle > 0 || scaled
    ? layoutTransformedDrawingText(drawing, members, declaration, placement.rectangle, measure, { maxRows, overflow, ...(scaled ? { compactLines: true } : {}) })
    : layoutDrawingText(drawing, members, declaration, placement.rectangle, measure, { maxRows, overflow });
  if (text.state !== "placed") return text;
  const rectangle = scaled ? { ...placement.rectangle, width: hwpUnitPixels(drawing.source.rendering_corners[1][0]), height: hwpUnitPixels(drawing.source.rendering_corners[3][1]) } : placement.rectangle;
  if (!drawing.source.caption) return { ...text, rectangle, captionRectangle: null };
  const remaining = maxRows - text.rows.length;
  if (remaining < 1) return unavailable("DrawingContentLayoutLimit");
  const caption = layoutDrawingCaption(drawing, paragraphs, rectangle, measure, { maxRows: remaining });
  if (caption.state !== "positioned") return caption;
  return { ...text, rectangle, captionRectangle: caption.captionRectangle, bounds: caption.bounds, rows: [...text.rows, ...caption.rows] };
}
