import { layoutSourceTableCaption } from "./table-caption-source-layout.mjs";

// Adapt ownership only; caption width, measurement and positioning stay shared.
export function layoutDrawingCaption(drawing, paragraphs, rectangle, measure, options = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  const source = drawing?.source?.caption;
  if (!source || !Array.isArray(paragraphs) || typeof measure !== "function") return unavailable("MissingDrawingCaptionSource");
  const members = paragraphs.filter(paragraph => paragraph.section === drawing.section && paragraph.drawingCaption?.drawingNode === drawing.drawingNode);
  if (!members.length) return unavailable("MissingDrawingCaptionContent");
  if (members.some(paragraph => paragraph.drawingCaption.captionNode !== source.caption_node || paragraph.drawingCaption.listNode !== source.list_node || paragraph.tableCaption || paragraph.tableCell)) return unavailable("DrawingCaptionBindingMismatch");
  const originals = new Map(members.map(paragraph => [paragraph.paragraph, paragraph]));
  const adapted = members.map(paragraph => ({ ...paragraph, tableCaption: { tableNode: drawing.drawingNode, captionNode: source.caption_node, listNode: source.list_node } }));
  const result = layoutSourceTableCaption({ section: drawing.section, tableNode: drawing.drawingNode, sourceCaption: source, sourceGeometry: { out_margin: drawing.source.flow?.outside_margins }, captionParagraphs: members.map(paragraph => paragraph.paragraph) }, adapted, rectangle,
    (text, paragraph, unit, kind) => measure(text, originals.get(paragraph.paragraph), unit, kind), options);
  if (result.state !== "positioned") return result;
  return { ...result, rows: result.rows.map(row => {
    const { tableNode, ...remaining } = row;
    return { ...remaining, drawingNode: tableNode };
  }) };
}
