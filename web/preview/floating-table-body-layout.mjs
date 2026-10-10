import { pageSequenceReference } from "./page-sequence-reference.mjs";
import { columnReferenceBoxes } from "./column-reference-boxes.mjs";
import { measureTableCells } from "./table-cell-measurement.mjs";
import { placeWholeFloatingTablePage } from "./whole-floating-table-page.mjs";
import { tableFlowLine } from "./table-paragraph-flow.mjs";
import { paragraphLineGeometry, paragraphSpacePixels } from "./paragraph-geometry.mjs";
import { structuralAnchorUnits } from "./structural-anchor-units.mjs";
import { alignTextRow } from "./line-alignment.mjs";

/** Whole rectangular floating table and single-column body, with real page spill. */
export function layoutFloatingTableBody(content, measure, maxRows = 20000) {
  const unavailable = error => ({ state: "unavailable", error });
  if (content.structuralAnchorErrors?.length || content.tableAnchorErrors?.length || content.tableGeometryErrors?.length || content.cellLayoutSourceErrors?.length) return unavailable("IncompleteFloatingTableSources");
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || content.tables?.length !== 1 || content.pageSettings?.length !== 1 || content.limited || content.paragraphs.some(p => p.clipped) || content.pictures?.length || content.lines?.length || content.drawings?.length) return unavailable("UnsupportedFloatingTableBody");
  const table = content.tables[0], setting = content.pageSettings[0];
  if (table.parentTableNode !== null || table.sourceCaption || table.pagination?.cell_spacing !== 0 || table.cells.some(cell => cell.sourceMargin?.header !== false) || content.paragraphs.some(p => p.tableCaption)) return unavailable("UnsupportedFloatingTablePolicy");
  const body = content.paragraphs.filter(p => !p.tableCell), flows = new Map();
  for (const flow of content.paragraphFlows ?? []) {
    if (!flow.top_level) continue;
    if (flow.host !== "body" || flow.section !== setting.section_ordinal || flow.column_break === true || flows.has(flow.paragraph)) return unavailable("UnsupportedFloatingTableFlow");
    flows.set(flow.paragraph, flow);
  }
  if (flows.size !== body.length || body.some(p => p.section !== setting.section_ordinal || !flows.has(p.paragraph))) return unavailable("UnsupportedFloatingTableFlow");
  const first = pageSequenceReference(setting, 0);
  if (first.state !== "placed") return unavailable(first.state);
  for (const flow of flows.values()) {
    const declarations = [flow.column_start_declaration, flow.column_declaration, ...(flow.column_changes ?? []).map(change => change.declaration)].filter(value => value != null);
    if (!declarations.length && flow.single_column !== true) return unavailable("UnsupportedFloatingTableColumns");
    for (const declaration of declarations) {
      const columns = columnReferenceBoxes(first.boxes.page, declaration);
      if (columns.state !== "placed" || columns.boxes.length !== 1) return unavailable("UnsupportedFloatingTableColumns");
    }
  }
  const host = body.find(p => p.paragraph === table.hostParagraph);
  if (!host || !Number.isSafeInteger(table.anchorUnit) || host.text[table.anchorUnit] !== "\ufffc") return unavailable("InvalidFloatingTableAnchor");
  try {
    for (const paragraph of body) {
      const structural = structuralAnchorUnits(paragraph);
      for (let unit = 0; unit < paragraph.text.length; unit++) if (paragraph.text[unit] === "\ufffc" && !structural.has(unit) && !(paragraph === host && unit === table.anchorUnit)) return unavailable("UnsupportedFloatingTableBodyControl");
    }
  } catch (error) { return unavailable(error.message); }
  const measured = measureTableCells(table, content.paragraphs, measure, { origin: { x: 0, y: 0 }, padding: "source", maxRows, paragraphFlows: content.paragraphFlows });
  if (measured.state !== "measured") return measured;
  const pages = [], rows = [], boxes = [];
  let current, cursor, placement;
  const nextPage = () => {
    if (pages.length >= 2000) return false;
    const ref = pageSequenceReference(setting, pages.length);
    if (ref.state !== "placed") return false;
    current = { ordinal: pages.length, ...ref.boxes, columns: [ref.boxes.page] };
    pages.push(current); cursor = current.page.y;
    return true;
  };
  if (!nextPage()) return unavailable("PageFlowLimit");
  const space = amount => {
    if (amount > current.page.height) return false;
    if (cursor + amount > current.page.y + current.page.height && !nextPage()) return false;
    cursor += amount; return Number.isFinite(cursor);
  };
  for (const paragraph of body) {
    if (flows.get(paragraph.paragraph).page_break === true && rows.length && !nextPage()) return unavailable("PageFlowLimit");
    if (!space(paragraphSpacePixels(paragraph.paragraphShape?.before))) return unavailable("UnsupportedPageSpacing");
    if (paragraph === host) {
      for (;;) {
        placement = placeWholeFloatingTablePage(table, measured, { paper: current.paper, page: current.page, column: current.page }, host,
          { anchorY: cursor, occupiedBottom: cursor, pageOrdinal: current.ordinal, maxRows: maxRows - rows.length });
        if (placement.state !== "next-page") break;
        if (!nextPage()) return unavailable("PageFlowLimit");
      }
      if (placement.state !== "placed") return placement;
      rows.push(...placement.rows); boxes.push(...placement.boxes);
    }
    let unit = 0, empty = paragraph.text.length === 0;
    while (unit < paragraph.text.length || empty) {
      if (rows.length >= maxRows) return unavailable("TablePageProjectionLimit");
      const exclusions = placement && placement.rows.every(row => row.pageOrdinal === current.ordinal) ? [{ table, rectangle: placement.rectangle }] : [];
      const geometry = paragraphLineGeometry({ ...paragraph.paragraphShape, alignment: 0 }, current.page.width, 0, unit === 0);
      const line = { x: current.page.x + geometry.x, y: cursor, width: geometry.width, height: 28 };
      const result = tableFlowLine(paragraph, unit, line, exclusions, (text, p, position, kind) => {
        const value = measure(text, p, position, kind);
        if (paragraph !== host || position !== table.anchorUnit) return value;
        return typeof value === "number" ? 0 : { ...value, width: 0 };
      });
      if (result.state !== "available") return unavailable(result.state);
      if (paragraph === host && unit === 0 && result.endUnit <= table.anchorUnit) return unavailable("UnsupportedMultiLineFloatingTableAnchor");
      if (result.height > current.page.height) return unavailable("UnsupportedPageRow");
      if (cursor + result.height > current.page.y + current.page.height) { if (!nextPage()) return unavailable("PageFlowLimit"); continue; }
      if ((!empty && result.endUnit === unit) || empty && !result.regions.length) {
        if (!Number.isFinite(result.nextY) || result.nextY <= cursor) return unavailable("NoFittingTableTextRegion");
        if (result.nextY + result.height > current.page.y + current.page.height) { if (!nextPage()) return unavailable("PageFlowLimit"); } else cursor = result.nextY;
        continue;
      }
      const fragments = result.fragments.length ? result.fragments : empty && result.regions.length ? [{ ...result.regions[0], text: "", startUnit: unit, endUnit: unit, boundaries: [{ unit, x: 0 }], textHeight: 20 }] : [];
      for (const fragment of fragments) {
        if (rows.length >= maxRows) return unavailable("TablePageProjectionLimit");
        const alignment = paragraphLineGeometry({ alignment: paragraph.paragraphShape?.alignment }, fragment.width, fragment.boundaries.at(-1).x, false);
        const row = { ...fragment, x: fragment.x + alignment.x, width: fragment.width - alignment.x, kind: "text", y: cursor, height: result.height, section: paragraph.section, paragraph: paragraph.paragraph,
          editable: paragraph.editable, selectable: paragraph.editable || paragraph.selectable, paragraphShape: paragraph.paragraphShape,
          pageOrdinal: current.ordinal, columnOrdinal: 0, referenceBoxes: { paper: current.paper, page: current.page, column: current.page },
          ...(paragraph === host ? { inlineTables: [{ unit: table.anchorUnit, tableNode: table.tableNode }] } : {}) };
        rows.push(alignTextRow(row, { lastLine: result.complete || result.hardBreak }));
      }
      unit = result.endUnit; empty = result.hardBreak === true && unit === paragraph.text.length; cursor += result.height;
    }
    if (!space(paragraphSpacePixels(paragraph.paragraphShape?.after))) return unavailable("UnsupportedPageSpacing");
  }
  if (!placement) return unavailable("MissingFloatingTablePlacement");
  return { state: "paginated", rows: rows.toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y || a.x - b.x), boxes, pages,
    height: pages.at(-1).paper.y + pages.at(-1).paper.height, spatialRows: true, limited: false, pageLayoutMode: "measured-body",
    tableAnchors: [{ section: table.section, tableNode: table.tableNode, hostParagraph: table.hostParagraph, anchorUnit: table.anchorUnit }] };
}
