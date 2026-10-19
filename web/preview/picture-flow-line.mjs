import { intersectPictureLineRegions } from "./picture-line-intersections.mjs";
import { regionTextFragments } from "./region-text-fragments.mjs";
import { TEXT_TOP } from "./row-geometry.mjs";
import { paragraphLineAdvance } from "./paragraph-geometry.mjs";
import { textMeasurement } from "./text-measurement.mjs";

export function pictureFlowLine(text, unit, line, pictures, measure, paragraphShape = null, lineRegions = intersectPictureLineRegions) {
  let height = line.height;
  for (let attempt = 0; attempt < 32; attempt++) {
    const regions = lineRegions({ ...line, height }, pictures, { includeNextEvent: true });
    if (regions.state !== "available") return regions;
    const result = regionTextFragments(text, unit, regions.regions, measure);
    const textHeight = result.fragments.reduce((value, fragment) => Math.max(value, fragment.textHeight), text.length > 0 && unit === text.length ? Math.max(20, textMeasurement(measure("", unit)).height) : 20);
    const required = Math.max(height, paragraphLineAdvance(paragraphShape, textHeight, Math.max(line.height, textHeight + TEXT_TOP)));
    if (!Number.isFinite(required) || required <= 0) return { state: "invalid_line_height" };
    if (required === height) return { state: "available", regions: regions.regions, nextY: regions.nextY, ...result, height, textHeight };
    height = required;
  }
  return { state: "unstable_line_height" };
}
