import { selectionRects } from "./text-geometry.mjs";
import { hitTransformedBox } from "./transformed-box-hit.mjs";

export function dutmalAnchorAtPoint(content, layout, x, y) {
  if (content.dutmalAvailable !== true || ![x, y].every(Number.isFinite)) return null;
  const boxes = [];
  for (const paragraph of content.paragraphs) {
    if (paragraph.clipped) continue;
    for (const row of paragraph.dutmal ?? []) {
      if (
        !Number.isInteger(row.node) ||
        !Number.isInteger(row.unit) ||
        row.unit < 0 ||
        paragraph.text[row.unit] !== "\ufffc"
      )
        continue;
      if (paragraph.dutmal.filter((other) => other.unit === row.unit).length !== 1) continue;
      const point = { section: paragraph.section, paragraph: paragraph.paragraph, unit: row.unit };
      for (const rectangle of selectionRects(layout, point, { ...point, unit: point.unit + 1 }))
        boxes.push({ ...rectangle, dutmal: { section: paragraph.section, node: row.node } });
    }
  }
  return hitTransformedBox(boxes, x, y)?.dutmal ?? null;
}
