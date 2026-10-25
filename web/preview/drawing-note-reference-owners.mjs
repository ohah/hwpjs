import { drawingColumnContext } from "./drawing-column-context.mjs";

// Reservation aliases are request-local; native note hosts remain unchanged.
export function selectDrawingNoteReferenceOwners(content) {
  const fail = error => ({ state: "unavailable", error });
  if (!Array.isArray(content?.paragraphs) || !Array.isArray(content.paragraphFlows)
    || !Array.isArray(content.drawings)) return fail("InvalidDrawingNoteReferenceOwners");
  const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
  if (content.paragraphs.some(p => !record(p) || typeof p.text !== "string"
    || p.automaticNumbers !== undefined && (!Array.isArray(p.automaticNumbers) || p.automaticNumbers.some(n => !record(n))))
    || content.paragraphFlows.some(f => !record(f)) || content.drawings.some(d => !record(d))
    || content.hwp5Notes !== undefined && (!Array.isArray(content.hwp5Notes) || content.hwp5Notes.some(n => !record(n))))
    return fail("InvalidDrawingNoteReferenceOwners");
  const owners = new Map();
  for (const paragraph of content.paragraphs) {
    if (!paragraph.drawingText) continue;
    const references = paragraph.automaticNumbers?.some(n => ["note-reference", "hwp5-note-reference"].includes(n.kind))
      || content.hwp5Notes?.some(n => n.section === paragraph.section && n.hostParagraph === paragraph.paragraph);
    if (!references) continue;
    const candidates = content.drawings.filter(d => d.section === paragraph.section && d.drawingNode === paragraph.drawingText.drawingNode);
    if (candidates.length !== 1) return fail("AmbiguousDrawingNoteReferenceOwner");
    const drawing = candidates[0];
    if (drawing.source?.group_context) return fail("UnsupportedGroupedDrawingNoteReference");
    const columns = drawingColumnContext(drawing, content.paragraphs, content.paragraphFlows);
    if (columns.state !== "selected") return columns;
    const hosts = content.paragraphs.filter(p => p.section === drawing.section && p.paragraph === drawing.hostParagraph);
    const flows = content.paragraphFlows.filter(f => f.section === drawing.section && f.paragraph === drawing.hostParagraph);
    if (hosts.length !== 1 || flows.length !== 1 || flows[0].host !== "body" || flows[0].top_level !== true
      || hosts[0].drawingText || hosts[0].tableCell || !Number.isSafeInteger(drawing.anchorUnit)
      || drawing.anchorUnit < 0 || hosts[0].text[drawing.anchorUnit] !== "\ufffc") return fail("InvalidDrawingNoteReferenceAnchor");
    const key = `${paragraph.section}:${paragraph.paragraph}`;
    if (owners.has(key)) return fail("AmbiguousDrawingNoteReferenceOwner");
    owners.set(key, { hostParagraph: drawing.hostParagraph, anchorUnit: drawing.anchorUnit });
  }
  return { state: "selected", owners };
}
