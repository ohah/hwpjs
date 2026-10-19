import { pictureFlowLine } from "./picture-flow-line.mjs";
import { paragraphLineGeometry, paragraphSpacePixels } from "./paragraph-geometry.mjs";
import { textMeasurement } from "./text-measurement.mjs";
import { alignPictureFragment } from "./picture-fragment-alignment.mjs";

// 호출자가 확정한 그림과 측정된 줄 높이의 문단 흐름입니다.
export function pictureParagraphFlow(text, box, pictures, measure, { lineHeight = 28, maxLines = 20000, paragraphShape = null, flowLine = pictureFlowLine } = {}) {
  if (typeof text !== "string") throw new TypeError("InvalidParagraphFlowText");
  if (!Number.isFinite(lineHeight) || lineHeight <= 0 || !Number.isInteger(maxLines) || maxLines < 1) throw new RangeError("InvalidParagraphFlowBounds");
  const rows = [];
  const after = paragraphSpacePixels(paragraphShape?.after);
  let unit = 0, y = box.y + paragraphSpacePixels(paragraphShape?.before);
  const align = fragment => alignPictureFragment(fragment, paragraphShape, fragment.endUnit === text.length);
  for (let line = 0; line < maxLines; line++) {
    const horizontal = paragraphShape && box.width > 0 ? paragraphLineGeometry({ ...paragraphShape, alignment: 0 }, box.width, 0, unit === 0) : { x: 0, width: box.width };
    const regions = flowLine(text, unit, { ...box, x: box.x + horizontal.x, width: horizontal.width, y, height: lineHeight }, pictures, measure, paragraphShape);
    if (regions.state !== "available") return { ...regions, rows, endUnit: unit, height: y - box.y };
    if (!regions.regions.length && Number.isFinite(regions.nextY) && regions.nextY > y) { y = regions.nextY; continue; }
    if (!regions.regions.some(region => region.width > 0)) return { state: "no_fitting_region", rows, endUnit: unit, height: y - box.y };
    if (unit === text.length && regions.regions.length) {
      const region = regions.regions[0];
      rows.push({ ...align({ ...region, text: "", startUnit: unit, endUnit: unit, boundaries: [{ unit, x: 0 }] }), y, height: regions.height, textHeight: text.length > 0 ? Math.max(20, textMeasurement(measure("", unit)).height) : 20 });
      if (!Number.isFinite(y + regions.height + after)) throw new RangeError("InvalidParagraphFlowBounds");
      return { state: "complete", rows, endUnit: unit, height: y - box.y + regions.height + after };
    }
    const result = regions;
    for (const fragment of result.fragments) rows.push({ ...align(fragment), y, height: result.height });
    if (!result.complete && result.endUnit === unit) {
      if (Number.isFinite(regions.nextY) && regions.nextY > y) { y = regions.nextY; continue; }
      return { state: "no_fitting_region", rows, endUnit: unit, height: y - box.y };
    }
    unit = result.endUnit; y += result.height;
    if (!Number.isFinite(y)) throw new RangeError("InvalidParagraphFlowBounds");
    if (result.complete) {
      if (!Number.isFinite(y + after)) throw new RangeError("InvalidParagraphFlowBounds");
      return { state: "complete", rows, endUnit: unit, height: y - box.y + after };
    }
  }
  return { state: "limited", rows, endUnit: unit, height: y - box.y };
}
