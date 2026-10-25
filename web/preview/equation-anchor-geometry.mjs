import { selectionRects } from "./text-geometry.mjs";
import { hitTransformedBox } from "./transformed-box-hit.mjs";

export function equationAnchorAtPoint(content, layout, x, y) {
  if (content.equationAvailable !== true || ![x, y].every(Number.isFinite)) return null;
  const boxes = [];
  for (const paragraph of content.paragraphs) {
    if (paragraph.clipped) continue;
    const counts = new Map();
    for (const row of paragraph.equations ?? []) counts.set(row.unit, (counts.get(row.unit) ?? 0) + 1);
    for (const row of paragraph.equations ?? []) {
      if (!Number.isInteger(row.node) || row.node < 0 || !Number.isInteger(row.unit) || row.unit < 0 || counts.get(row.unit) !== 1 || paragraph.text[row.unit] !== "\ufffc") continue;
      const point = { section: paragraph.section, paragraph: paragraph.paragraph, unit: row.unit };
      for (const rectangle of selectionRects(layout, point, { ...point, unit: point.unit + 1 })) boxes.push({ ...rectangle, equation: { section: paragraph.section, node: row.node } });
    }
  }
  return hitTransformedBox(boxes, x, y)?.equation ?? null;
}
