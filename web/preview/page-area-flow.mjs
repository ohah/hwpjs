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
    if (!area || !["both", "odd", "even"].includes(area.apply) || !["top", "center", "bottom"].includes(area.vertical_alignment) || ![area.width, area.height].every(value => Number.isInteger(value) && value > 0 && value <= 0xffffffff)) return unavailable("UnsupportedPageArea");
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
      if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) return unavailable("MissingPageAreaBox");
      const width = hwpUnitPixels(area.width), height = hwpUnitPixels(area.height);
      if (width > box.width + 1e-9) return unavailable("PageAreaOverflow");
      const paragraphs = group.paragraphs.map(paragraph => paragraph.automaticNumbers?.some(number => number.source?.hwp5PageNumber === true) ? { ...paragraph, displayPageNumber: page.number } : paragraph);
      const measured = layoutContent({ paragraphs, limited: false }, width, measure, maxRows, { documentBody: true });
      if (measured.limited || result.length + measured.rows.length > maxRows) return unavailable("PageAreaOverflow");
      const band = Math.min(height, box.height), slack = Math.max(0, band - measured.height);
      if (measured.height > band) overflow.push({ pageOrdinal: page.ordinal, pageNumber: page.number, pageArea: host, ownerNode: area.owner_node, declaredHeight: height, availableHeight: box.height, measuredHeight: measured.height });
      const offset = area.vertical_alignment === "bottom" ? slack : area.vertical_alignment === "center" ? slack / 2 : 0;
      for (const row of measured.rows) result.push({ ...row, x: box.x, y: box.y + offset + row.y, pageOrdinal: page.ordinal, pageNumber: page.number, pageArea: host, referenceBoxes: { paper: page.paper, page: page.page, column: box } });
    }
  }
  return { state: "placed", rows: result, overflow };
}
