import { layoutContent } from "./layout.mjs";
import { placeFloatingTable } from "./table-placement.mjs";
import { prepareTablePageBands, tablePageBandFragment } from "./table-page-bands.mjs";
import { projectTablePageFragments } from "./table-page-fragments.mjs";
import { resolveTablePadding } from "./table-source-insets.mjs";
import { paragraphLineGeometry } from "./paragraph-geometry.mjs";
import { alignedReferenceCoordinate } from "./picture-placement.mjs";
import { selectMasterPages } from "./master-page-selection.mjs";
import { signedInt32 } from "./signed-int32.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { tableCellInsets } from "./table-insets.mjs";
import { tableCellReferenceBox } from "./table-cell-reference-box.mjs";
const validBox = box => box && [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite) && box.width > 0 && box.height > 0;

/** Explicit-page table projection; neither source sizes nor area overflow are hidden. */
export function projectPageAreaTables(area, measured, page, measure, maxRows = 20000) {
  const fail = error => ({ state: "unavailable", error });
  if (measured?.state !== "tables-measured" || !Array.isArray(measured.entries) || !Number.isSafeInteger(page?.ordinal) || page.ordinal < 0
    || !Number.isInteger(page.number) || page.number < 1 || page.number > 0xffffffff || !Number.isSafeInteger(maxRows) || maxRows < 1
    || !validBox(page.paper) || !validBox(page.page) || !validBox(page[area?.host])) return fail("InvalidPageAreaTableProjection");
  try {
    if (!selectMasterPages(area.area, [page]).length) return { state: "tables-projected", rows: [], anchorRows: [], boxes: [], overflow: [], flowPictures: [], tableAnchors: [] };
    if (area.area.vertical_alignment !== "top" || ![area.area.width, area.area.height].every(v => Number.isInteger(v) && v > 0 && v <= 0xffffffff)) return fail("UnsupportedPageAreaTableAlignment");
    const physical = page[area.host], width = hwpUnitPixels(area.area.width);
    if (width > physical.width + 1e-9) return fail("PageAreaOverflow");
    const box = { ...physical, width, height: Math.min(physical.height, hwpUnitPixels(area.area.height)) };
    const rows = [], anchorRows = [], boxes = [], overflow = [], flowPictures = [], tableAnchors = [], seen = new Set();
    for (const { table, measured: cells } of measured.entries) {
      const source = table.sourceGeometry, host = area.paragraphs.find(p => p.section === table.section && p.paragraph === table.hostParagraph);
      const offset = signedInt32(source?.geometry?.vertical_offset);
      if (!area.tables.includes(table) || !host || host.clipped || source?.geometry?.treat_as_character !== false || table.sourceCaption
        || source.geometry.width_relative !== 4 || source.geometry.height_relative !== 2 || source.text_wrap !== 1 || source.text_flow !== 0
        || source.flow_with_text !== true || source.allow_overlap !== false || cells?.state !== "measured"
        || offset === null || ![0, 1, 2].includes(source.vertical_relative) || ![0, 1, 2].includes(source.vertical_alignment)
        || ![0, 1, 2, 3].includes(source.horizontal_relative) || !Array.isArray(source.out_margin) || source.out_margin.length !== 4
        || !source.out_margin.every(v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff)) return fail("UnsupportedPageAreaTablePolicy");
      const identity = `${table.section}:${table.tableNode}`;
      if (seen.has(identity)) return fail("AmbiguousPageAreaTableProjection");
      seen.add(identity);
      const margins = source.out_margin.map(hwpUnitPixels), [left, right, top, bottom] = margins;
      const hostLayout = layoutContent({ paragraphs: [host], limited: false }, hwpUnitPixels(area.area.width), measure, maxRows, { documentBody: true, compactLines: true });
      const anchors = hostLayout.rows.filter(row => row.kind === "text" && row.startUnit <= table.anchorUnit && table.anchorUnit < row.endUnit);
      if (hostLayout.limited || anchors.length !== 1) return fail("MissingPageAreaTableAnchor");
      const line = paragraphLineGeometry({ ...host.paragraphShape, alignment: 0 }, hwpUnitPixels(area.area.width), 0, true);
      const paragraph = { x: box.x + line.x, y: box.y + anchors[0].y, width: line.width, height: anchors[0].height };
      const references = { paper: page.paper, page: page.page, column: box, paragraph };
      const name = ["paper", "page", "column", "paragraph"][source.horizontal_relative];
      const horizontal = references[name];
      if (source.horizontal_relative !== 3) references[name] = { ...horizontal, x: horizontal.x + left, width: horizontal.width - left - right };
      const placed = placeFloatingTable(table, references);
      if (placed.state !== "placed") return fail("UnsupportedPageAreaTableAnchor");
      const vertical = [page.paper, page.page, paragraph][source.vertical_relative];
      const y = alignedReferenceCoordinate(vertical.y, vertical.height, cells.grid.height + top + bottom, hwpUnitPixels(offset), source.vertical_alignment) + top;
      const rectangle = { x: placed.rectangle.x, y, width: cells.grid.width, height: cells.grid.height };
      if (!validBox(rectangle) || rectangle.x - left < page.paper.x || rectangle.x + rectangle.width + right > page.paper.x + page.paper.width
        || rectangle.y - top < page.paper.y || rectangle.y + rectangle.height + bottom > page.paper.y + page.paper.height) return fail("PageAreaTablePaperOverflow");
      if (rectangle.x - left < box.x || rectangle.x + rectangle.width + right > box.x + box.width
        || rectangle.y - top < box.y || rectangle.y + rectangle.height + bottom > box.y + box.height) overflow.push({ section: table.section, tableNode: table.tableNode, pageOrdinal: page.ordinal, pageArea: area.host, rectangle });
      const prepared = prepareTablePageBands(table, cells.grid.rows, "whole", { left, right, top, bottom });
      if (prepared.state !== "prepared") return prepared;
      const fragment = tablePageBandFragment(prepared, { x: rectangle.x - left, y: rectangle.y - top, bandOrdinal: 0,
        pageOrdinal: page.ordinal, columnOrdinal: 0, referenceBoxes: { paper: page.paper, page: page.page, column: box } });
      const projected = projectTablePageFragments(table, cells.grid, cells.flows, { state: "planned", pages: [page], fragments: [fragment] },
        { origin: { x: 0, y: 0 }, padding: resolveTablePadding(table, "source"), maxRows: maxRows - rows.length - anchorRows.length });
      if (projected.state !== "placed") return projected;
      for (const row of projected.rows) {
        const cell = table.cells.find(cell => cell.listNode === row.listNode);
        const cellBox = projected.boxes.find(box => box.tableNode === row.tableNode && box.listNode === row.listNode);
        const column = tableCellReferenceBox(cellBox, tableCellInsets(resolveTablePadding(table, "source"), cell), cells.flows.get(row.listNode), row.cellColumnOrdinal);
        if (!column) return fail("MissingPageAreaCellReference");
        rows.push({ ...row, pageArea: area.host, pageNumber: page.number, referenceBoxes: { ...row.referenceBoxes, column } });
      }
      boxes.push(...projected.boxes.map(row => ({ ...row, pageArea: area.host })));
      flowPictures.push(...(projected.flowPictures ?? []).map(picture => ({ ...picture, pageArea: area.host })));
      tableAnchors.push({ section: table.section, tableNode: table.tableNode, hostParagraph: table.hostParagraph, anchorUnit: table.anchorUnit, pageOrdinal: page.ordinal, pageArea: area.host });
      anchorRows.push(...hostLayout.rows.map(row => ({ ...row, x: box.x, y: box.y + row.y, pageArea: area.host, pageOrdinal: page.ordinal,
        referenceBoxes: { paper: page.paper, page: page.page, column: box } })));
      if (rows.length + anchorRows.length > maxRows) return fail("PageAreaTableProjectionLimit");
    }
    return { state: "tables-projected", rows, anchorRows, boxes, overflow, flowPictures, tableAnchors };
  } catch (error) { return fail(error.message); }
}
