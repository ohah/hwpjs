import { layoutContent } from "./layout.mjs";
import { measureTableCells } from "./table-cell-measurement.mjs";
import { layoutMeasuredMultipleTables } from "./multiple-table-page-layout.mjs";
import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { placeTablePagesHorizontally } from "./table-page-horizontal-placement.mjs";
import { reserveTableCaptionSpace } from "./table-caption-page-reservation.mjs";
import { projectTablePageCaption } from "./table-caption-page-projection.mjs";
import { placeInlineTablePages } from "./inline-table-page-placement.mjs";
import { paragraphSpacePixels } from "./paragraph-geometry.mjs";
import { measureInlineTableParagraph } from "./inline-table-paragraph-measurement.mjs";
import { tablePageAnchorError } from "./table-page-anchor-policy.mjs";
import { inlinePictureIndex } from "./picture-inline.mjs";
import { pictureTextMeasure } from "./picture-text-measurement.mjs";
import { picturePaintPlan } from "./picture-paint-plan.mjs";
import { signedInt32 } from "./signed-int32.mjs";
import { paginatePictureRows } from "./picture-page-flow.mjs";
import { columnReferenceBoxes } from "./column-reference-boxes.mjs";
import { measureBlockTableHost } from "./block-table-host-flow.mjs";
import { layoutFloatingTableBody } from "./floating-table-body-layout.mjs";

// Source-ordered block tables; inline, captions and nested flow are separate.
export function layoutTableBodyContent(content, measure, maxRows) {
  const unavailable = error => ({ state: "unavailable", error });
  if (content.structuralAnchorErrors?.length || content.tableAnchorErrors?.length || content.tableGeometryErrors?.length || content.cellLayoutSourceErrors?.length) return unavailable("IncompleteTableSources");
  if (content.tableCaptionErrors?.length || content.tableCaptionBindingErrors?.length || content.hwp5CaptionErrors?.length || content.hwp5CaptionGeometryErrors?.length) return unavailable("UnsupportedTableCaption");
  if (content.tables?.some(table => [0, 4].includes(table.sourceGeometry?.text_wrap) && table.sourceGeometry.geometry?.treat_as_character === false)) return layoutFloatingTableBody(content, measure, maxRows);
  if (!content.tables?.length || content.pageSettings?.length !== 1 || content.limited || content.lines?.length || content.paragraphs.some(p => p.clipped)) return unavailable("UnsupportedPageObjects");
  const pictures = content.pictures ?? [];
  const inline = pictures.filter(p => p.geometry?.treatAsCharacter === true);
  const floating = pictures.filter(p => p.geometry?.treatAsCharacter !== true);
  const bodyPictures = floating.filter(p => !content.paragraphs.find(paragraph => paragraph.section === p.section && paragraph.paragraph === p.paragraph)?.tableCell);
  if (new Set(pictures.map(p => `${p.section}:${p.pictureNode}`)).size !== pictures.length || floating.some(p => signedInt32(p.flow?.zOrder) === null)) return unavailable("UnsupportedTablePagePictures");
  if (pictures.some(p => ["ownerError", "geometryError", "positionError", "flowError", "cropError", "transformError", "renderingCornersError"].some(key => p[key] != null) || picturePaintPlan(p).state === "unsupported_transform" || !Array.isArray(p.crop?.clip) || p.crop.clip.length !== 4 || !Array.from(p.crop.clip).every(Number.isFinite))) return unavailable("UnsupportedTablePagePictures");
  if (floating.some(p => p.flow?.textWrap !== 1 || p.position?.relations?.[2] !== 0)) return unavailable("UnsupportedTablePagePictures");
  const pictureIndex = inlinePictureIndex({ ...content, pictures: inline });
  if (pictureIndex.size !== inline.length || [...pictureIndex.values()].some(item => !item)) return unavailable("UnsupportedTablePagePictures");
  if (pictures.length) measure = pictureTextMeasure(pictureIndex, bodyPictures, measure);
  const setting = content.pageSettings[0], entries = [], hosts = new Map(), tableIds = new Set();
  let remaining = maxRows;
  const reference = pageReferenceBoxes(content.pageSettings[0], { x: 20, y: 20 });
  if (reference.state !== "placed") return unavailable(reference.state);
  for (const table of content.tables) {
    const source = table?.sourceGeometry, geometry = source?.geometry;
    if (!table || !Array.isArray(table.cells) || !source) return unavailable("UnsupportedPageObjects");
    const inline = geometry?.treat_as_character === true;
    const allowedBreak = table.pagination?.page_break === "cell" || table.pagination?.page_break === "none";
    if (table.parentTableNode !== null || !allowedBreak || table.pagination?.cell_spacing !== 0 || table.cells.some(cell => cell.sourceMargin?.header !== false)) return { ...unavailable("UnsupportedTablePagePolicy"), tableNode: table.tableNode, policyReason: table.parentTableNode !== null ? "UnsupportedNestedTablePagePolicy" : "UnsupportedTableBandPolicy" };
    const host = content.paragraphs.find(p => p.section === table.section && p.paragraph === table.hostParagraph);
    const anchorReason = tablePageAnchorError(source);
    if (anchorReason) return { ...unavailable("UnsupportedTablePageAnchor"), tableNode: table.tableNode, anchorReason };
    const mixedInline = inline && host?.text !== "\ufffc";
    if (inline && (typeof host?.text !== "string" || !host.text.includes("\ufffc"))) return unavailable("UnsupportedInlineTableHost");
    if (inline && Object.hasOwn(table, "anchorUnit") && (!Number.isSafeInteger(table.anchorUnit) || table.anchorUnit < 0 || host.text[table.anchorUnit] !== "\ufffc")) return unavailable("InvalidInlineTableAnchorPosition");
    if (table.section !== setting.section_ordinal) return unavailable("UnsupportedPageSections");
    if (tableIds.has(table.tableNode)) return unavailable("AmbiguousTablePageHost");
    const raw = source.out_margin;
    if (!Array.isArray(raw) || raw.length !== 4 || !raw.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff)) return unavailable("MissingTableOuterInsets");
    const [left, right, top, bottom] = raw.map(hwpUnitPixels);
    if (remaining < 1) return unavailable("TableCellMeasurementLimit");
    const origin = { x: 0, y: 0 }, measured = measureTableCells(table, content.paragraphs, measure, { origin, padding: "source", maxRows: remaining,
      pictures, paragraphFlows: content.paragraphFlows, pictureReferences: { paper: reference.boxes.paper, page: reference.boxes.page, column: reference.boxes.page } });
    if (measured.state !== "measured") return measured;
    remaining -= measured.rowCount;
    let outerInsets = { left, right, top, bottom }, captionReservation;
    if (inline && !mixedInline) { outerInsets.top += paragraphSpacePixels(host.paragraphShape?.before); outerInsets.bottom += paragraphSpacePixels(host.paragraphShape?.after); }
    let inlineFlow;
    if (table.sourceCaption) {
      captionReservation = reserveTableCaptionSpace(table, content.paragraphs, { x: 0, y: 0, width: measured.grid.width, height: measured.grid.height }, measure, outerInsets, { maxRows: remaining });
      if (captionReservation.state !== "reserved") return captionReservation;
      remaining -= captionReservation.rowCount;
      outerInsets = captionReservation.outerInsets;
    }
    const siblings = hosts.get(table.hostParagraph) ?? [];
    if (siblings.length && entries[siblings.at(-1)].table.tableNode >= table.tableNode) return unavailable("AmbiguousTablePageHost");
    siblings.push(entries.length); hosts.set(table.hostParagraph, siblings); tableIds.add(table.tableNode);
    entries.push({ table, measured, origin, padding: "source", rowHeights: measured.grid.rows, splitMode: table.pagination.page_break === "none" || captionReservation || inline || geometry.vertical_offset !== 0 || source.vertical_relative === 1 ? "whole" : "row-bands", outerInsets, captionReservation, inline, host, inlineFlow });
  }
  for (const siblings of hosts.values()) {
    const group = siblings.map(index => entries[index]);
    if (!group.some(entry => entry.inline)) continue;
    if (group.some(entry => !entry.inline)) return unavailable("UnsupportedInlineTableHost");
    const host = group[0].host;
    if (host.text.split("\ufffc").length - 1 !== group.length) return unavailable("UnsupportedInlineTableHost");
    if (group.length === 1 && host.text === "\ufffc") continue;
    const inlineFlow = measureInlineTableParagraph(host, group.map(({ table, measured, outerInsets }) => ({ tableNode: table.tableNode, ...(Object.hasOwn(table, "anchorUnit") ? { unit: table.anchorUnit } : {}), width: measured.grid.width + outerInsets.left + outerInsets.right, height: measured.grid.height + outerInsets.top + outerInsets.bottom })), reference.boxes.page.width, measure, { maxRows: remaining, allowLineOverflow: true });
    if (inlineFlow.state !== "measured") return inlineFlow;
    if (inlineFlow.anchors.some(anchor => reference.boxes.page.x + anchor.x + anchor.width > reference.boxes.paper.x + reference.boxes.paper.width + 1e-8)) return unavailable("InlineTablePaperWidthOverflow");
    remaining -= inlineFlow.rows.length;
    for (const entry of group) entry.inlineFlow = inlineFlow;
  }
  if (content.paragraphs.some(p => p.section !== setting.section_ordinal)) return unavailable("UnsupportedPageSections");
  const body = content.paragraphs.filter(p => !p.tableCell && !p.tableCaption), bodyIds = new Set(body.map(p => p.paragraph));
  const flows = (content.paragraphFlows ?? []).filter(flow => bodyIds.has(flow.paragraph));
  const singleBodyColumn = flow => {
    if (flow.single_column === true) return true;
    if (flow.column_declaration == null) return false;
    const columns = columnReferenceBoxes(reference.boxes.page, flow.column_declaration);
    return columns.state === "placed" && columns.boxes.length === 1;
  };
  if (flows.length !== body.length || flows.some(flow => flow.top_level !== true || flow.host !== "body" || !singleBodyColumn(flow) || flow.column_break === true)) return unavailable("UnsupportedPageFlow");
  const sequence = [], seen = new Set();
  for (const paragraph of body) {
    if (hosts.has(paragraph.paragraph)) {
      const siblings = hosts.get(paragraph.paragraph);
      if (seen.has(paragraph.paragraph)) return unavailable("UnsupportedTableHostText");
      seen.add(paragraph.paragraph);
      if (!entries[siblings[0]].inlineFlow && paragraph.text !== "\ufffc".repeat(siblings.length)) {
        const hostFlow = measureBlockTableHost(paragraph, siblings.map(tableIndex => ({ table: entries[tableIndex].table, tableIndex })), reference.boxes.page.width, measure, remaining);
        if (hostFlow.state !== "measured") return hostFlow;
        remaining -= hostFlow.rowCount; sequence.push(...hostFlow.sequence);
        continue;
      }
      if (siblings.length > 1 && entries[siblings[0]].inlineFlow) sequence.push({ inlineTableIndices: siblings });
      else sequence.push(...siblings.map(tableIndex => ({ tableIndex })));
    } else {
      if (remaining < 1) return unavailable("TablePagePlanLimit");
      const measured = layoutContent({ paragraphs: [paragraph], limited: false }, reference.boxes.page.width, measure, remaining, { documentBody: true });
      if (measured.limited) return unavailable("TablePagePlanLimit");
      remaining -= measured.rows.length; sequence.push(...measured.rows);
    }
  }
  if (seen.size !== hosts.size) return unavailable("UnsupportedTablePageHost");
  let result = layoutMeasuredMultipleTables(entries, sequence, setting, flows, { maxRows, ...(bodyPictures.length ? { paginateRows: (rows, setting, flows, options) => paginatePictureRows(rows, setting, flows, bodyPictures, body, options) } : {}) });
  if (result.state !== "placed") return result;
  for (const entry of entries) {
    if (entry.inlineFlow) continue;
    result = entry.inline ? placeInlineTablePages(entry.table, entry.host, result, entry.outerInsets) : placeTablePagesHorizontally(entry.table, result, entry.outerInsets, entry.host);
    if (result.state !== "placed") return result;
  }
  for (const entry of entries) {
    if (!entry.captionReservation) continue;
    result = projectTablePageCaption(entry.table, entry.captionReservation, result, { maxRows });
    if (result.state !== "placed") return result;
  }
  const placements = [...(result.flowPictures ?? []), ...(result.pictureReservations ?? [])];
  const flowPictures = placements.length ? placements.map(item => {
    const source = pictures.find(p => p.section === item.section && p.pictureNode === item.pictureNode);
    return { ...item, paragraph: source?.paragraph, anchorUnit: source?.anchorUnit };
  }) : undefined;
  if (floating.some(p => flowPictures?.filter(item => item.section === p.section && item.pictureNode === p.pictureNode && item.anchorUnit === p.anchorUnit).length !== 1)) return unavailable("IncompleteTablePagePictures");
  const tableAnchors = entries.map(({ table }) => ({ section: table.section, tableNode: table.tableNode, hostParagraph: table.hostParagraph, anchorUnit: table.anchorUnit }));
  return { ...result, tableAnchors, ...(flowPictures ? { flowPictures } : {}), state: "paginated" };
}
