import { layoutContent } from "./layout.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { selectPageAreaInstances } from "./page-area-instance-selection.mjs";

/** Repeat source paragraphs in explicit page areas; caller owns effective page numbering. */
export function layoutPageAreas(content, pages, measure, maxRows = 20000) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("InvalidPageAreaBounds");
  const groups = new Map();
  let section;
  for (const flow of content.paragraphFlows ?? []) {
    if (!["header", "footer"].includes(flow.host)) continue;
    section ??= flow.section;
    if (flow.section !== section) return unavailable("UnsupportedPageAreaSections");
    const area = flow.page_area;
    if (!area || !["both", "odd", "even"].includes(area.apply) || !["top", "center", "bottom"].includes(area.vertical_alignment) || !(Number.isInteger(area.width) && area.width > 0 && area.width <= 0xffffffff && Number.isInteger(area.height) && area.height >= 0 && area.height <= 0xffffffff)) return unavailable("UnsupportedPageArea");
    const paragraph = content.paragraphs.find(p => p.section === flow.section && p.paragraph === flow.paragraph);
    if (!paragraph || paragraph.clipped || paragraph.tableCell) return unavailable("MissingPageAreaParagraph");
    const key = `${flow.section}:${flow.host}:${area.owner_node}:${area.list_node}`;
    const group = groups.get(key) ?? { host: flow.host, area, paragraphs: [] };
    if (["apply", "width", "height", "vertical_alignment"].some(key => group.area[key] !== area[key])) return unavailable("ConflictingPageArea");
    group.paragraphs.push(paragraph); groups.set(key, group);
  }
  const result = [], overflow = [];
  for (const page of pages) {
    const selected = selectPageAreaInstances([...groups.values()], page);
    if (selected.state !== "selected") return selected;
    for (const group of selected.areas) {
      const { area, host } = group;
      const box = page[host];
      if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height < 0) return unavailable("MissingPageAreaBox");
      const width = hwpUnitPixels(area.width), height = hwpUnitPixels(area.height);
      if (width > box.width + 1e-9) return unavailable("PageAreaOverflow");
      const paragraphs = group.paragraphs.map(paragraph => paragraph.automaticNumbers?.some(number => number.source?.hwp5PageNumber === true) ? { ...paragraph, displayPageNumber: page.number } : paragraph);
      const measured = layoutContent({ paragraphs, limited: false }, width, measure, maxRows, { documentBody: true });
      // An empty zero-height declaration still owns its parity/selection slot.
      // Keep source anchors without giving them an input hit box over the body.
      const emptyZeroArea = height === 0 && box.height === 0 && measured.rows.every(row => row.kind === "gap"
        || row.kind === "text" && row.text === "" && !row.numberPrefix);
      const areaRows = emptyZeroArea ? measured.rows.filter(row => row.kind === "text").map(row => ({ ...row,
        height: 0, textHeight: 0, textTop: 0, editable: false, selectable: false, sourceObjectAnchor: true })) : measured.rows;
      const measuredHeight = emptyZeroArea ? 0 : measured.height;
      if (measured.limited || result.length + areaRows.length > maxRows) return unavailable("PageAreaOverflow");
      const band = height === 0 ? box.height : Math.min(height, box.height);
      const slack = height === 0 ? 0 : Math.max(0, band - measuredHeight);
      if (measuredHeight > band) overflow.push({ pageOrdinal: page.ordinal, pageNumber: page.number, pageArea: host, ownerNode: area.owner_node, declaredHeight: height, availableHeight: box.height, measuredHeight });
      const offset = area.vertical_alignment === "bottom" ? slack : area.vertical_alignment === "center" ? slack / 2 : 0;
      for (const row of areaRows) result.push({ ...row, x: box.x, y: box.y + offset + row.y, pageOrdinal: page.ordinal, pageNumber: page.number, pageArea: host, referenceBoxes: { paper: page.paper, page: page.page, column: box } });
    }
  }
  return { state: "placed", rows: result, overflow };
}
