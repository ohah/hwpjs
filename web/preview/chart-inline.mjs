import { hwpUnitPixels } from "./hwp-units.mjs";
import { picturePositionKey } from "./picture-inline.mjs";

/** Source size for inline chart reservation; no virtual picture or image cache. */
export function chartInlineItem(target, value) {
  const g = value?.host?.geometry;
  if (g?.treat_as_character !== true || g.width_relative !== 4 || g.height_relative !== 2 ||
      ![g.width, g.height].every(n => Number.isInteger(n) && n > 0 && n <= 0xffffffff)) return null;
  return { picture: target, width: hwpUnitPixels(g.width), height: hwpUnitPixels(g.height) };
}
export function inlineChartIndex(content, read) {
  const result = new Map();
  if (content.chartDisplayAvailable !== true) return result;
  for (const target of content.chartTargets ?? []) {
    if (target.error_name) continue;
    const resource = read(target.section, target.wrapper);
    if (!resource?.value || resource.error) continue;
    const owners = content.paragraphs.filter(p => p.section === target.section && p.paragraph === target.paragraph);
    if (owners.length !== 1 || owners[0].clipped || owners[0].tableCell || owners[0].text?.[target.anchorUnit] !== "\ufffc") continue;
    const item = chartInlineItem(target, resource.value);
    if (!item) continue;
    const key = picturePositionKey(target.section, target.paragraph, target.anchorUnit);
    const pictureConflict = (content.pictures ?? []).some(picture => picture.state === "located" && picture.section === target.section && picture.paragraph === target.paragraph && picture.anchorUnit === target.anchorUnit);
    result.set(key, result.has(key) || pictureConflict ? null : item);
  }
  return result;
}
