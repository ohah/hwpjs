import { placeFloatingPicture } from "./picture-placement.mjs";
import { rowLeft, rowTop, rowHeight, TEXT_TOP, TEXT_LEFT } from "./row-geometry.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { signedInt32 } from "./signed-int32.mjs";
import { linePaintPoints } from "./line-paint.mjs";
import { decoratedLineBounds } from "./decorated-line-bounds.mjs";

export function previewLineLayers(content, layout, columnWidth) {
  const result = { behind: [], front: [], unavailable: [], height: layout.height };
  for (const line of content.lines ?? []) {
    const reject = error => result.unavailable.push({ section: line.section, lineNode: line.lineNode, error });
    if (!["located", "reference_located"].includes(line.state) || !line.placement) { reject(line.error ?? line.placementError ?? "MissingLinePlacement"); continue; }
    const paragraph = content.paragraphs.find(p => p.section === line.section && p.paragraph === line.paragraph);
    if (!paragraph || paragraph.clipped || paragraph.tableCell || paragraph.text?.[line.anchorUnit] !== "\ufffc") { reject("UnsupportedLineHost"); continue; }
    const rows = layout.rows.map((row, index) => ({ row, index })).filter(({ row }) => row.kind === "text" && row.section === line.section && row.paragraph === line.paragraph);
    const anchorRow = rows.find(({ row }) => row.startUnit <= line.anchorUnit && line.anchorUnit < row.endUnit);
    if (!anchorRow) { reject("MissingLineAnchorRow"); continue; }
    const first = rows[0], last = rows.at(-1);
    const boxes = {
      ...layout.referenceBoxes?.[line.section],
      column: { x: TEXT_LEFT, y: 0, width: columnWidth, height: layout.height },
      ...anchorRow.row.referenceBoxes,
      paragraph: { x: rowLeft(first.row), y: rowTop(first.row, first.index) + TEXT_TOP, width: first.row.width, height: rowTop(last.row, last.index) + rowHeight(last.row) - rowTop(first.row, first.index) },
    };
    const { geometry, position, flow } = line.placement;
    const zOrder = signedInt32(flow.zOrder);
    if (zOrder === null || ![2, 3].includes(flow.textWrap)) { reject("UnsupportedLineFlow"); continue; }
    const placed = placeFloatingPicture({ geometry, position }, boxes);
    if (placed.state !== "placed") { reject(placed.state); continue; }
    const referenceBounds = line.state === "reference_located" ? decoratedLineBounds(line.referencePlan) : null;
    if (line.state === "reference_located") {
      if (!referenceBounds) { reject("UnsupportedLineStroke"); continue; }
    } else if (!linePaintPoints(line, placed.rectangle)) { reject("UnsupportedLineStroke"); continue; }
    result[flow.textWrap === 2 ? "behind" : "front"].push({ line, zOrder, origin: placed.rectangle });
    const halfWidth = line.state === "reference_located" ? line.referencePlan.strokeWidth / 2 : hwpUnitPixels(line.stroke.width / 2);
    result.height = Math.max(result.height, ...line.endpoints.map(point => placed.rectangle.y + hwpUnitPixels(point[1]) + halfWidth));
    if (referenceBounds) result.height = Math.max(result.height, placed.rectangle.y + referenceBounds.bottom);
  }
  for (const list of [result.behind, result.front]) list.sort((a, b) => a.zOrder - b.zOrder);
  return result;
}
