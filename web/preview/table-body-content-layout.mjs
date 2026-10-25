import { projectCellPictureCaptions } from "./cell-picture-caption-projection.mjs";
import {effectiveCellPictureAlignments} from "./cell-picture-effective-alignment.mjs";
import {inlineTableHostLeading} from "./inline-table-host-leading.mjs";
import {tableSourceFailure} from "./table-source-failure.mjs";
import { cellCutBodyOptionsError } from "./cell-cut-body-options.mjs";
import { layoutContent } from "./layout.mjs";
import { isSingleInlineTableHost } from "./single-inline-table-host.mjs";
import { measureTableCells } from "./table-cell-measurement.mjs";
import { layoutMeasuredMultipleTables } from "./multiple-table-page-layout.mjs";
import { supportsSplitTableCaption } from "./table-caption-fragment.mjs";
import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { inlineTablePageFitHeight } from "./inline-table-page-fit.mjs";
import { placeTablePagesHorizontally } from "./table-page-horizontal-placement.mjs";
import { reserveTableCaptionSpace } from "./table-caption-page-reservation.mjs";
import { projectTablePageCaption } from "./table-caption-page-projection.mjs";
import { placeInlineTablePages } from "./inline-table-page-placement.mjs";
import { paragraphSpacePixels } from "./paragraph-geometry.mjs";
import { measureInlineTableParagraph } from "./inline-table-paragraph-measurement.mjs";
import { tablePageAnchorError } from "./table-page-anchor-policy.mjs";
import { inlinePictureIndex } from "./picture-inline.mjs";
import { pictureTextMeasure } from "./picture-text-measurement.mjs";
import { measureInlinePictureParagraph } from "./inline-picture-paragraph-measurement.mjs";
import { projectInlinePictureCaptions } from "./inline-picture-caption-flow.mjs";
import { picturePaintPlan } from "./picture-paint-plan.mjs";
import { signedInt32 } from "./signed-int32.mjs";
import { paginatePictureRows } from "./picture-page-flow.mjs";
import { tableBodyFlowFailure } from "./table-body-flow-policy.mjs";
import { measureTableColumnParagraph, remeasureTableColumnRow } from "./table-column-content.mjs";
import { belowHostFloatingTableFlow } from "./below-host-floating-table-flow.mjs";
import { measureBlockTableHost } from "./block-table-host-flow.mjs";
import { measureMixedTableHost } from "./mixed-table-host-flow.mjs";
import { layoutFloatingTableBody } from "./floating-table-body-layout.mjs";
import { validateNestedTableOwnership } from "./nested-table-ownership.mjs";
import { measureNestedTable } from "./nested-table-measurement.mjs";
import { nestedTablePaperBounds } from "./nested-table-paper-bounds.mjs";
import { tableCollisionFootprints } from "./table-collision-footprints.mjs";
import { measureInlineTableColumnParagraph } from "./inline-table-column-measurement.mjs";
import { measureBlockTableColumnHost } from "./block-table-column-host.mjs";
import { tableVerticalReference } from "./table-vertical-reference.mjs";
import { paginatePaperTableRows } from "./paper-table-page-flow.mjs";
import { inlineTableRowFitsPaper } from "./inline-table-row-fit.mjs";
import { tableSourceHorizontalLayout } from "./table-source-horizontal-layout.mjs";
import { inlineTableHostAnchors } from "./inline-table-host-anchors.mjs";
import { hasPictureSourceErrors, hasFinitePictureCrop } from "./picture-source-validation.mjs";
import { checkTablePictureReservations } from "./table-picture-reservation-check.mjs";
import { paginateReservedPictureRows } from "./reserved-picture-page-flow.mjs";
import { paginateBodyRows } from "./page-row-flow.mjs";
import { paragraphCellOffset } from "./paragraph-cell-offset-policy.mjs";
import { reserveCellFloatingDrawings } from "./cell-floating-drawing-flow.mjs";
import { inlineObjectAnchorIndex } from "./inline-object-anchor-index.mjs";
import { projectFloatingPicturePage } from "./picture-page-projection.mjs";
import { singleCellPictureColumn } from "./single-cell-picture-column.mjs";
import { clipCellOverlayPicture } from "./cell-overlay-page-clip.mjs";
import { unrestrictedCellPictureReferences } from "./unrestricted-cell-picture-reference.mjs";

// Source-ordered block tables; inline, captions and nested flow are separate.
export function layoutTableBodyContent(content, measure, maxRows, { minimumCellHeight, measureBodyParagraph, measureCellFlow, completeLayout, rowY, minimumRowPage, columnBottom, paginateRows, pictureReferences } = {}) {
  content=effectiveCellPictureAlignments(content);
  const unavailable = error => ({ state: "unavailable", error });
  if (pictureReferences === undefined) pictureReferences = singleCellPictureColumn;
  const inlineAnchors=inlineObjectAnchorIndex(content);
  if(inlineAnchors.state!=="indexed")return inlineAnchors;
  if (measureBodyParagraph !== undefined && typeof measureBodyParagraph !== "function") return unavailable("InvalidTableBodyMeasurement");
  if (measureCellFlow !== undefined && typeof measureCellFlow !== "function") return unavailable("InvalidTableCellMeasurement");
  if (completeLayout !== undefined && typeof completeLayout !== "function") return unavailable("InvalidTableLayoutCompletion");
  const nested = content.tables?.some(table => table.parentTableNode != null);
  if (nested) {
    try { validateNestedTableOwnership(content); }
    catch { return unavailable("InvalidNestedTableFlow"); }
  }
  const sourceFailure=tableSourceFailure(content);if(sourceFailure)return sourceFailure;
  if (content.tableCaptionErrors?.length || content.tableCaptionBindingErrors?.length || content.hwp5CaptionErrors?.length || content.hwp5CaptionGeometryErrors?.length) return unavailable("UnsupportedTableCaption");
  if (content.tables?.some(table => table.parentTableNode == null
    && ([0, 4].includes(table.sourceGeometry?.text_wrap)||table.sourceGeometry?.flow_with_text===false)
    && table.sourceGeometry.geometry?.treat_as_character === false)) return columnBottom !== undefined || paginateRows !== undefined
    ? unavailable("UnsupportedPageColumnReservation") : layoutFloatingTableBody(content, measure, maxRows,{measureCellFlow,completeLayout,pictureReferences});
  if (!content.tables?.length || content.pageSettings?.length !== 1 || content.limited || content.lines?.length || content.paragraphs.some(p => p.clipped)) return unavailable("UnsupportedPageObjects");
  const pictures = content.pictures ?? [];
  const inline = pictures.filter(p => p.geometry?.treatAsCharacter === true);
  const floating = pictures.filter(p => p.geometry?.treatAsCharacter !== true);
  const unrestricted = unrestrictedCellPictureReferences(content);
  if (unrestricted.state !== "selected") return unrestricted;
  const localPictures = pictures.filter(p => !unrestricted.references.has(`${p.section}:${p.pictureNode}`));
  const measurementContent = localPictures.length === pictures.length ? content : { ...content, pictures: localPictures };
  const referenceHosts = new Set([...unrestricted.references.values()].map(p => `${p.section}:${p.paragraph}`));
  const bodyFloating = [...floating.filter(p => !content.paragraphs.find(paragraph => paragraph.section === p.section && paragraph.paragraph === p.paragraph)?.tableCell),
    ...unrestricted.references.values()];
  const overlays = bodyFloating.filter(p => [2, 3].includes(p.flow?.textWrap));
  const cellOverlays = floating.filter(p => !bodyFloating.includes(p) && [2, 3].includes(p.flow?.textWrap));
  const bodyPictures = bodyFloating.filter(p => !overlays.includes(p));
  if (new Set(pictures.map(p => `${p.section}:${p.pictureNode}`)).size !== pictures.length || floating.some(p => signedInt32(p.flow?.zOrder) === null)) return unavailable("UnsupportedTablePagePictures");
  if (pictures.some(p => hasPictureSourceErrors(p) || picturePaintPlan(p).state === "unsupported_transform" || !hasFinitePictureCrop(p))) return unavailable("UnsupportedTablePagePictures");
  if (floating.some(p => (!overlays.includes(p) && !cellOverlays.includes(p) && ![0, 1].includes(p.flow?.textWrap)) || p.position?.relations?.[2] !== 0
    || (p.flow.textWrap === 0 && !bodyPictures.includes(p)
      && !content.paragraphs.find(row => row.section === p.section && row.paragraph === p.paragraph)?.tableCell))) return unavailable("UnsupportedTablePagePictures");
  if ([...overlays, ...cellOverlays].some(p => p.owner?.anchorNode !== p.pictureNode || p.caption || p.captionPartial)) return unavailable("UnsupportedTableOverlayPicture");
  const pictureIndex = inlinePictureIndex({ ...content, pictures: inline });
  if (pictureIndex.size !== inline.length || [...pictureIndex.values()].some(item => !item)) return unavailable("UnsupportedTablePagePictures");
  const glyphMeasure = measure;
  if (pictures.length) measure = pictureTextMeasure(pictureIndex, floating, measure);
  const setting = content.pageSettings[0], entries = [], hosts = new Map(), mixedHostPlans = new Map(), tableIds = new Set();
  const body = content.paragraphs.filter(p => !p.tableCell && !p.tableCaption && !p.drawingCaption), bodyIds = new Set(body.map(p => p.paragraph));
  const flows = (content.paragraphFlows ?? []).filter(flow => bodyIds.has(flow.paragraph));
  const columnZones = flows.some(flow => flow.single_column !== true);
  let remaining = maxRows;
  const reference = pageReferenceBoxes(content.pageSettings[0], { x: 20, y: 20 });
  if (reference.state !== "placed") return unavailable(reference.state);
  for (const table of content.tables) {
    if (table.parentTableNode != null) continue;
    const source = table?.sourceGeometry, geometry = source?.geometry;
    if (!table || !Array.isArray(table.cells) || !source) return unavailable("UnsupportedPageObjects");
    const inline = geometry?.treat_as_character === true;
    const allowedBreak = ["cell", "none", "table"].includes(table.pagination?.page_break);
    if (table.parentTableNode !== null || !allowedBreak || table.pagination?.cell_spacing !== 0 || table.cells.some(cell => typeof cell.sourceMargin?.header !== "boolean")) return { ...unavailable("UnsupportedTablePagePolicy"), tableNode: table.tableNode, policyReason: table.parentTableNode !== null ? "UnsupportedNestedTablePagePolicy" : "UnsupportedTableBandPolicy" };
    const host = content.paragraphs.find(p => p.section === table.section && p.paragraph === table.hostParagraph);
    const anchorReason = tablePageAnchorError(source);
    if (anchorReason) return { ...unavailable("UnsupportedTablePageAnchor"),section:table.section,paragraph:table.hostParagraph, tableNode: table.tableNode, anchorReason };
    const mixedInline = inline && !isSingleInlineTableHost(host,table);
    if (inline && (typeof host?.text !== "string" || !host.text.includes("\ufffc"))) return { ...unavailable("UnsupportedInlineTableHost"), section: table.section, tableNode: table.tableNode, paragraph: table.hostParagraph, policyReason: "missing-inline-anchor" };
    if (inline && Object.hasOwn(table, "anchorUnit") && (!Number.isSafeInteger(table.anchorUnit) || table.anchorUnit < 0 || host.text[table.anchorUnit] !== "\ufffc")) return unavailable("InvalidInlineTableAnchorPosition");
    if (table.section !== setting.section_ordinal) return unavailable("UnsupportedPageSections");
    if (tableIds.has(table.tableNode)) return unavailable("AmbiguousTablePageHost");
    const raw = source.out_margin;
    if (!Array.isArray(raw) || raw.length !== 4 || !raw.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff)) return unavailable("MissingTableOuterInsets");
    const [left, right, top, bottom] = raw.map(hwpUnitPixels);
    if (remaining < 1) return unavailable("TableCellMeasurementLimit");
    const origin = { x: 0, y: 0 };
    const hasChildren = content.tables.some(child => child.section === table.section && child.parentTableNode === table.tableNode);
    const sourceColumns = hasChildren ? null : tableSourceHorizontalLayout(table);
    if (sourceColumns && sourceColumns.state !== "resolved") return { ...sourceColumns, section: table.section, tableNode: table.tableNode };
    const completeCellFlow = content.cellFloatingDrawingSources?.length ? input => reserveCellFloatingDrawings(input, content.cellFloatingDrawingSources) : undefined;
    const deferMultilineAlignment = table.pagination.page_break === "cell" && !inline && !table.sourceCaption
      && !content.tables.some(child=>child.section===table.section && child.parentTableNode===table.tableNode && child.sourceGeometry?.geometry?.treat_as_character===false)
      && !(geometry.vertical_offset !== 0 && paragraphCellOffset(table) === null) && ![0,1].includes(source.vertical_relative)
      && !cellCutBodyOptionsError({columnZones,rowY,columnBottom}) && !flows.some(flow=>flow.column_break===true);
    const measured = hasChildren ? measureNestedTable(measurementContent, table, measure, { maxRows: remaining, overflow: "visible", deferMultilineAlignment, minimumCellHeight, measureCellFlow, completeCellFlow,pictureReferences }) : measureTableCells(table, content.paragraphs, measure, { origin, padding: "source", maxRows: remaining, minimumCellHeight, completeCellFlow, deferMultilineAlignment,
      ...sourceColumns.gridOptions,
      pictures: localPictures, paragraphFlows: content.paragraphFlows, measureCellFlow, pictureReferences });
    if (measured.state !== "measured") return { ...measured, section: measured.section ?? table.section, tableNode: measured.tableNode ?? table.tableNode };
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
    entries.push({ inlineHostLeading:inline&&!mixedInline?inlineTableHostLeading(table,host,measured.grid.height,measure):0, table, measured, sourceColumnEvidence: sourceColumns?.evidence, origin, padding: "source", rowHeights: measured.grid.rows, splitMode: table.pagination.page_break === "none" || captionReservation && !supportsSplitTableCaption(table) || inline || geometry.vertical_offset !== 0 && paragraphCellOffset(table) === null || [0, 1].includes(source.vertical_relative) ? "whole" : "row-bands", outerInsets, captionReservation, inline, host, inlineFlow });
    if (inline && isSingleInlineTableHost(host, table) && table.pagination.page_break === "cell" && !captionReservation
      && measured.grid.height + outerInsets.top + outerInsets.bottom > reference.boxes.page.height) entries.at(-1).splitMode = "row-bands";
    if (source.vertical_relative === 0 && !inline) {
      const physical = tableVerticalReference(source, { paperTop: reference.boxes.paper.y, paperBottom: reference.boxes.paper.y + reference.boxes.paper.height,
        pageTop: reference.boxes.page.y, pageBottom: reference.boxes.page.y + reference.boxes.page.height,
        height: measured.grid.height + outerInsets.top + outerInsets.bottom });
      if (physical.state !== "resolved") return physical;
      entries.at(-1).paperFlow = physical.outsideBody;
    }
  }
  for (const siblings of hosts.values()) {
    const group = siblings.map(index => entries[index]);
    if (!group.some(entry => entry.inline)) continue;
    const host = group[0].host;
    const hostOverlays = [
      ...(content.floatingDrawingAnchors ?? []).filter(anchor => anchor.section === host.section && anchor.paragraph === host.paragraph),
      ...overlays.filter(p => p.section === host.section && p.paragraph === host.paragraph)
        .map(p => ({ section: p.section, paragraph: p.paragraph, anchorUnit: p.anchorUnit, node: p.pictureNode })),
    ];
    const textAnchors = [...inline.filter(p => p.section === host.section && p.paragraph === host.paragraph).map(p => ({ section: p.section, paragraph: p.paragraph, anchorUnit: p.anchorUnit, node: p.pictureNode })),
      ...(content.inlineObjectAnchors ?? []).filter(p => p.section === host.section && p.paragraph === host.paragraph)];
    if (group.some(entry => !entry.inline)) {
      const sourceFlow = content.paragraphFlows?.find(flow => flow.section === host.section && flow.paragraph === host.paragraph);
      if (sourceFlow?.single_column === false) return unavailable("UnsupportedMixedTableHostColumns");
      const plan = measureMixedTableHost(host, siblings.map(tableIndex => ({ entry: entries[tableIndex], tableIndex })),
        reference.boxes.page.width, measure, remaining, { overlays: hostOverlays, textAnchors });
      if (plan.state !== "measured") return plan;
      for (const { indices, flow } of plan.inlineFlows) {
        if (flow.anchors.some(anchor => reference.boxes.page.x + anchor.x + anchor.width > reference.boxes.paper.x + reference.boxes.paper.width + 1e-8)) return unavailable("InlineTablePaperWidthOverflow");
        for (const index of indices) entries[index].inlineFlow = flow;
      }
      remaining -= plan.rowCount;
      mixedHostPlans.set(host.paragraph, plan.sequence);
      continue;
    }
    const anchors = host.text.split("\ufffc").length - 1 === group.length && !hostOverlays.length && !textAnchors.length
      ? { state: "resolved", zeroWidthUnits: [], textAnchorUnits: [] } : inlineTableHostAnchors(host,
      group.map(({ table }) => ({ section: table.section, paragraph: table.hostParagraph, anchorUnit: table.anchorUnit, node: table.tableNode })),
      hostOverlays, textAnchors);
    if (anchors.state !== "resolved") return unavailable(anchors.error);
    if (group.length === 1 && !hostOverlays.length && !textAnchors.length && isSingleInlineTableHost(host,group[0].table)
      && !referenceHosts.has(`${host.section}:${host.paragraph}`)) continue;
    const inlineEntries = group.map(({ table, measured, outerInsets }) => {
      const height = measured.grid.height + outerInsets.top + outerInsets.bottom;
      const pageFitHeight = inlineTablePageFitHeight(table, height, outerInsets);
      return { tableNode: table.tableNode, ...(Object.hasOwn(table, "anchorUnit") ? { unit: table.anchorUnit } : {}),
        width: measured.grid.width + outerInsets.left + outerInsets.right, height,
        ...(pageFitHeight < height ? { pageFitHeight } : {}) };
    });
    const flow = content.paragraphFlows?.find(flow => flow.section === host.section && flow.paragraph === host.paragraph);
    const inlineFlow = flow?.single_column === false
      ? measureInlineTableColumnParagraph(host, inlineEntries, flow, reference.boxes.page, measure, { maxRows: remaining, allowLineOverflow: true, zeroWidthUnits: anchors.zeroWidthUnits, textAnchorUnits: anchors.textAnchorUnits })
      : measureInlineTableParagraph(host, inlineEntries, reference.boxes.page.width, measure, { maxRows: remaining, allowLineOverflow: true, zeroWidthUnits: anchors.zeroWidthUnits, textAnchorUnits: anchors.textAnchorUnits });
    if (inlineFlow.state !== "measured") return inlineFlow;
    if (inlineFlow.anchors.some(anchor => reference.boxes.page.x + anchor.x + anchor.width > reference.boxes.paper.x + reference.boxes.paper.width + 1e-8)) return unavailable("InlineTablePaperWidthOverflow");
    remaining -= inlineFlow.rows.length;
    for (const entry of group) entry.inlineFlow = inlineFlow;
  }
  if (content.paragraphs.some(p => p.section !== setting.section_ordinal)) return unavailable("UnsupportedPageSections");
  const flowFailure = tableBodyFlowFailure(body, flows, reference.boxes.page, { allowColumns: true });
  if (flowFailure) return { ...unavailable("UnsupportedPageFlow"), ...flowFailure };
  const unsupportedColumnPicture = columnZones && bodyPictures.find(p => ![0, 1].includes(p.flow.textWrap) || p.caption != null);
  if (unsupportedColumnPicture) return { ...unavailable("UnsupportedTableColumnPictures"), section: unsupportedColumnPicture.section,
    paragraph: unsupportedColumnPicture.paragraph, pictureNode: unsupportedColumnPicture.pictureNode,
    policyReason: unsupportedColumnPicture.caption != null ? "caption" : "wrapping" };
  const sequence = [], seen = new Set();
  for (const paragraph of body) {
    if (hosts.has(paragraph.paragraph)) {
      const siblings = hosts.get(paragraph.paragraph);
      if (seen.has(paragraph.paragraph)) return unavailable("UnsupportedTableHostText");
      seen.add(paragraph.paragraph);
      if (mixedHostPlans.has(paragraph.paragraph)) {
        sequence.push(...mixedHostPlans.get(paragraph.paragraph));
        continue;
      }
      if (!entries[siblings[0]].inlineFlow && paragraph.text !== "\ufffc".repeat(siblings.length)
        && !(siblings.length===1&&isSingleInlineTableHost(paragraph,entries[siblings[0]].table))) {
        const hostEntries = siblings.map(tableIndex => ({ table: entries[tableIndex].table, tableIndex }));
        const hostAnchors = {
          overlays: [...(content.floatingDrawingAnchors ?? []).filter(a => a.section === paragraph.section && a.paragraph === paragraph.paragraph),
            ...bodyFloating.filter(p => p.section === paragraph.section && p.paragraph === paragraph.paragraph)
              .map(p => ({section:p.section,paragraph:p.paragraph,anchorUnit:p.anchorUnit,node:p.pictureNode}))],
          textAnchors: [...inline.filter(p => p.section === paragraph.section && p.paragraph === paragraph.paragraph)
            .map(p => ({section:p.section,paragraph:p.paragraph,anchorUnit:p.anchorUnit,node:p.pictureNode})),
            ...(content.inlineObjectAnchors ?? []).filter(a => a.section === paragraph.section && a.paragraph === paragraph.paragraph)],
        };
        const hostFlow = columnZones
          ? measureBlockTableColumnHost(paragraph, hostEntries, flows.find(flow => flow.paragraph === paragraph.paragraph), reference.boxes.page, measure, remaining, hostAnchors)
          : measureBlockTableHost(paragraph, hostEntries, reference.boxes.page.width, measure, remaining, hostAnchors);
        if (hostFlow.state !== "measured") return hostFlow;
        remaining -= hostFlow.rowCount;
        sequence.push(...belowHostFloatingTableFlow(paragraph,hostEntries,hostFlow,{columns:columnZones}).sequence);
        continue;
      }
      if (siblings.length > 1 && entries[siblings[0]].inlineFlow) sequence.push({ inlineTableIndices: siblings });
      else sequence.push(...siblings.map(tableIndex => ({ tableIndex })));
    } else {
      if (remaining < 1) return unavailable("TablePagePlanLimit");
      const supplied = measureBodyParagraph?.({ paragraph, width: reference.boxes.page.width, measure, maxRows: remaining });
      const pictureFlow = supplied === undefined && !columnZones
        ? measureInlinePictureParagraph(paragraph, pictureIndex, reference.boxes.page.width, glyphMeasure, remaining, content.paragraphs) : null;
      const measured = supplied ?? pictureFlow ?? (columnZones ? measureTableColumnParagraph(paragraph, flows.find(flow => flow.paragraph === paragraph.paragraph), reference.boxes.page, measure, remaining)
        : layoutContent({ paragraphs: [paragraph], limited: false }, reference.boxes.page.width, measure, remaining, { documentBody: true }));
      if (measured.state === "unavailable") return measured;
      if (!Array.isArray(measured.rows)) return unavailable("InvalidTableBodyMeasurement");
      if (measured.limited) return unavailable("TablePagePlanLimit");
      const count = measured.rowCount ?? measured.rows.length;
      if (!Number.isSafeInteger(count) || count < measured.rows.length || count > remaining) return unavailable("TablePagePlanLimit");
      remaining -= count; sequence.push(...measured.rows);
    }
  }
  if (seen.size !== hosts.size) return unavailable("UnsupportedTablePageHost");
  const paperEntries = entries.filter(entry => entry.paperFlow);
  if (paperEntries.length && bodyPictures.length) return unavailable("UnsupportedMixedPaperTablePictures");
  const baseOptions = paperEntries.length ? { paginateRows: (rows, setting, flows, options) => paginatePaperTableRows(rows, setting, flows, paperEntries, options) }
      : bodyPictures.some(p => p.flow.textWrap === 0 || p.caption != null)
        ? { paginateRows: (rows, setting, flows, options) => paginateReservedPictureRows(rows, setting, flows, bodyPictures, body, measure,
          { ...options, captionParagraphs: content.paragraphs, edgePolicy: "inside-start-outside-end" }) }
        : bodyPictures.length ? { paginateRows: (rows, setting, flows, options) => paginatePictureRows(rows, setting, flows, bodyPictures, body, options) } : {};
  let result = layoutMeasuredMultipleTables(entries, sequence, setting, flows, { maxRows, rowFitsColumn: inlineTableRowFitsPaper, rowY, minimumRowPage, columnBottom,
    ...(columnZones ? { columnZones: true, measureRow: (source, width) => remeasureTableColumnRow(source, width, measure) } : {}), ...baseOptions,
    ...(paginateRows ? { paginateRows: (rows, setting, flows, options) => paginateRows(rows, setting, flows, options, baseOptions.paginateRows ?? paginateBodyRows) } : {}) });
  if (result.state !== "placed") return result;
  result = projectInlinePictureCaptions(content, pictureIndex, result, glyphMeasure, maxRows);
  if (result.state === "unavailable") return result;
  for (const entry of entries) {
    if (entry.paperFlow) continue;
    if (entry.inlineFlow) continue;
    result = entry.inline ? placeInlineTablePages(entry.table, entry.host, result, entry.outerInsets) : placeTablePagesHorizontally(entry.table, result, entry.outerInsets, entry.host);
    if (result.state !== "placed") return { ...result, section: entry.table.section, paragraph: entry.table.hostParagraph, tableNode: entry.table.tableNode };
  }
  for (const entry of entries) {
    if (!entry.captionReservation) continue;
    result = projectTablePageCaption(entry.table, entry.captionReservation, result, { maxRows });
    if (result.state !== "placed") return result;
  }
  const tableAnchors = entries.map(({ table }) => ({ section: table.section, tableNode: table.tableNode, hostParagraph: table.hostParagraph, anchorUnit: table.anchorUnit }));
  if (completeLayout) {
    result = completeLayout({...result,tableAnchors});
    if (!result || typeof result !== "object") return unavailable("InvalidTableLayoutCompletion");
    if (result.state === "unavailable") return result;
    if (!Array.isArray(result.rows) || !Array.isArray(result.boxes)) return unavailable("InvalidTableLayoutCompletion");
  }
  const overlayPlacements = [];
  for (const picture of overlays) {
    const placed = projectFloatingPicturePage(picture, content.paragraphs, result.rows);
    if (placed.state !== "placed") return { ...placed, section: picture.section, pictureNode: picture.pictureNode };
    overlayPlacements.push({ ...placed, section: picture.section, pictureNode: picture.pictureNode });
  }
  const placements = [...(result.flowPictures ?? []), ...(result.pictureReservations ?? []), ...overlayPlacements];
  const nestedBounds = nestedTablePaperBounds(result.boxes);
  if (nestedBounds.state !== "contained") return nestedBounds;
  const flowPictures = placements.length ? [] : undefined;
  const cellOverlayKeys = new Set(cellOverlays.map(p => `${p.section}:${p.pictureNode}`));
  for (const item of placements) {
    const source = pictures.find(p => p.section === item.section && p.pictureNode === item.pictureNode);
    let picture = { ...item, paragraph: source?.paragraph, anchorUnit: source?.anchorUnit };
    if (cellOverlayKeys.has(`${item.section}:${item.pictureNode}`)) {
      const clipped = clipCellOverlayPicture(picture, item.referenceBoxes?.paper);
      if (clipped.state !== "clipped") return clipped;
      picture = clipped.picture;
    }
    flowPictures.push(picture);
  }
  if (floating.some(p => flowPictures?.filter(item => item.section === p.section && item.pictureNode === p.pictureNode && item.anchorUnit === p.anchorUnit).length !== 1)) return unavailable("IncompleteTablePagePictures");
  const footprints = [...(result.inlineTableFootprints ?? [])], footprintErrors = [];
  for (const entry of entries) {
    const collected = tableCollisionFootprints(entry.table, result, entry.outerInsets, nested || content.createdTables?.length ? content : null);
    if (collected.state === "collected") footprints.push(...collected.footprints);
    else footprintErrors.push({ section: entry.table.section, tableNode: entry.table.tableNode, error: collected.error });
  }
  if (result.pictureReservations?.length) {
    if (footprintErrors.length) return unavailable("IncompleteTablePictureCollisionFootprints");
    const checked = checkTablePictureReservations(footprints, result.pictureReservations);
    if (checked.state !== "clear") return checked;
  }
  const tableColumnEvidence = entries.flatMap(entry => [...(entry.sourceColumnEvidence ? [{ section: entry.table.section, tableNode: entry.table.tableNode, ...entry.sourceColumnEvidence }] : []), ...(entry.measured.columnEvidence ?? [])]);
  const cellFloatingDrawingReservations = entries.flatMap(entry => [...entry.measured.flows.values()].flatMap(flow => flow.floatingDrawings ?? []));
  return projectCellPictureCaptions(content, { ...result, cellFloatingDrawingReservations, pages: result.pages.map(page => ({ ...page, section: setting.section_ordinal })), tableAnchors: result.tableAnchors ?? tableAnchors, tableCollisionFootprints: footprints, tableCollisionFootprintErrors: footprintErrors,
    ...(tableColumnEvidence.length ? { tableColumnEvidence } : {}), ...(flowPictures ? { flowPictures } : {}), state: "paginated" }, maxRows);
}
