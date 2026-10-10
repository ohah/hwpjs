import { tableLineRegions } from "./table-line-regions.mjs";
import { pictureFlowLine } from "./picture-flow-line.mjs";
import { pictureParagraphFlow } from "./picture-paragraph-flow.mjs";
import { measureDisplayRun } from "./text-measurement.mjs";
import { intersectPictureLineRegions } from "./picture-line-intersections.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

function intersectTables(line, tables) {
  const initial = intersectPictureLineRegions(line, []);
  if (initial.state !== "available") return initial;
  let regions = initial.regions, nextY = Infinity;
  for (const { table, rectangle } of tables) {
    const result = tableLineRegions(line, rectangle, table);
    if (result.state !== "available") return result;
    const bottom = rectangle.y + rectangle.height + hwpUnitPixels(table.sourceGeometry.out_margin[3]);
    if (bottom > line.y) nextY = Math.min(nextY, bottom);
    const next = [];
    for (const a of regions) for (const b of result.regions) {
      const x = Math.max(a.x, b.x), end = Math.min(a.x + a.width, b.x + b.width);
      if (end > x) next.push({ x, width: end - x });
    }
    regions = next;
  }
  return { state: "available", regions, ...(Number.isFinite(nextY) ? { nextY } : {}) };
}

export function tableFlowLine(paragraph, unit, line, tables, measure) {
  return pictureFlowLine(paragraph.text, unit, line, tables,
    (text, position) => measureDisplayRun(text, paragraph, position, "text", measure), paragraph.paragraphShape, intersectTables);
}

/** Measured rectangular table avoidance; page/anchor placement is caller-owned. */
export function tableParagraphFlow(paragraph, box, tables, measure, options = {}) {
  return pictureParagraphFlow(paragraph.text, box, tables,
    (text, unit) => measureDisplayRun(text, paragraph, unit, "text", measure),
    { ...options, paragraphShape: paragraph.paragraphShape,
      flowLine: (text, unit, line, items, measured, shape) => pictureFlowLine(text, unit, line, items, measured, shape, intersectTables) });
}
