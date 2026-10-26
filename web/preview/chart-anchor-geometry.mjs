import { selectionRects } from "./text-geometry.mjs";
import { hitTransformedBox } from "./transformed-box-hit.mjs";
export function chartAnchorAtPoint(content, layout, x, y) {
  if (content.chartEditAvailable !== true) return null;
  const boxes = [];
  for (const chart of content.chartTargets ?? []) {
    if (
      chart.error_name ||
      !Number.isInteger(chart.paragraph) ||
      !Number.isInteger(chart.anchorUnit)
    )
      continue;
    const paragraph = content.paragraphs.find(
      (p) => p.section === chart.section && p.paragraph === chart.paragraph,
    );
    if (paragraph?.text[chart.anchorUnit] !== "\ufffc") continue;
    const point = { section: chart.section, paragraph: chart.paragraph, unit: chart.anchorUnit };
    for (const rectangle of selectionRects(layout, point, { ...point, unit: point.unit + 1 }))
      boxes.push({ ...rectangle, chart });
  }
  return hitTransformedBox(boxes, x, y)?.chart ?? null;
}
