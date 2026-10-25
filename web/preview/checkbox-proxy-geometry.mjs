// Semantic state adornment at the native protected unit, not original form layout.
import { selectionRects } from "./text-geometry.mjs";
import { inlineCheckBoxIndex, checkBoxPositionKey } from "./checkbox-inline-layout.mjs";
const states = new Set(["CHECKED", "UNCHECKED", "INDETERMINATE"]);
export function checkBoxProxyBoxes(content, layout) {
  if (content.checkBoxStateAvailable !== true) return [];
  const result = [];
  const sourceBoxes = inlineCheckBoxIndex(content);
  for (const checkBox of content.checkBoxes ?? []) {
    if (checkBox.siteState !== "located" || !states.has(checkBox.state)) continue;
    const paragraph = content.paragraphs.find(p => p.section === checkBox.section && p.paragraph === checkBox.paragraph);
    if (!paragraph || paragraph.text[checkBox.anchorUnit] !== "\ufffc") continue;
    const point = { section: checkBox.section, paragraph: checkBox.paragraph, unit: checkBox.anchorUnit };
    const rectangles = selectionRects(layout, point, { ...point, unit: point.unit + 1 });
    if (rectangles.length !== 1) continue;
    const rect = rectangles[0], size = Math.min(16, rect.width, rect.height);
    if (sourceBoxes.blocked.has(checkBoxPositionKey(checkBox.section, checkBox.paragraph, checkBox.anchorUnit))) continue;
    const source = sourceBoxes.get(checkBoxPositionKey(checkBox.section, checkBox.paragraph, checkBox.anchorUnit));
    if (source) { result.push({ ...rect, width: source.width, height: source.height, font: source.font, sourceSized: true, checkBox }); continue; }
    if (![rect.x, rect.y, size].every(Number.isFinite) || size < 4) continue;
    result.push({ ...rect, x: rect.x + (rect.width - size) / 2, y: rect.y + (rect.height - size) / 2, width: size, height: size, checkBox });
  }
  return result;
}
export { hitTransformedBox as hitCheckBoxProxy } from "./transformed-box-hit.mjs";
