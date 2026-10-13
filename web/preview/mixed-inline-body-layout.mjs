import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { columnReferenceBoxes } from "./column-reference-boxes.mjs";
import { layoutContent } from "./layout.mjs";
import { paginateBodyRows } from "./page-row-flow.mjs";
import { measureInlineObjectParagraph } from "./inline-object-paragraph-measurement.mjs";
import { projectInlineObjectPages } from "./inline-object-page-projection.mjs";
import { measureTableCells } from "./table-cell-measurement.mjs";
import { layoutInlineTablePageContent } from "./inline-table-page-content.mjs";
import { layoutInlineDrawingPageContent } from "./inline-drawing-page-content.mjs";
import { drawingColumnContext } from "./drawing-column-context.mjs";
import { drawingAxisGeometry } from "./drawing-axis-geometry.mjs";
import { signedInt32 } from "./signed-int32.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { mixedInlineTablePolicy } from "./mixed-inline-table-policy.mjs";
import { validateNestedTableOwnership } from "./nested-table-ownership.mjs";
import { measureNestedTable } from "./nested-table-measurement.mjs";
import { prepareSplitInlineTableHost } from "./split-inline-table-host.mjs";
import { tablePageBandFragment } from "./table-page-bands.mjs";
import { projectTablePageFragments } from "./table-page-fragments.mjs";
import { resolveTablePadding } from "./table-source-insets.mjs";
import { measureInlineDrawingContent } from "./inline-drawing-measurement.mjs";
import { projectCellPageCuts } from "./table-cell-page-projection.mjs";
import { drawingFillPlan } from "./drawing-fill-plan.mjs";
import { nestedTablePaperBounds } from "./nested-table-paper-bounds.mjs";

// 혼합 인라인 문서의 조립만 소유합니다. 측정·다단·셀·도형 배치는 공통 모듈에 위임합니다.
export function layoutMixedInlineBody(content, measure, maxRows = 20000) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || content.pageSettings?.length !== 1 || content.limited
    || content.pictures?.length || content.lines?.length || content.drawingTextBindingErrors?.length || content.drawingTextSnapshotErrors?.length
    || content.tableCaptionErrors?.length || content.tableCaptionBindingErrors?.length) return unavailable("UnsupportedMixedInlineContent");
  const setting = content.pageSettings[0], reference = pageReferenceBoxes(setting, { x: 20, y: 20 });
  if (reference.state !== "placed") return reference;
  const groups = new Map(), measuredTables = new Map(), measuredDrawings = new Map(), nodes = new Set();
  const hasNested = (content.tables ?? []).some(table => table.parentTableNode != null);
  let ownership;
  if (hasNested) {
    try { ownership = validateNestedTableOwnership(content); }
    catch { return unavailable("InvalidNestedTableFlow"); }
  }
  let remaining = maxRows;
  const add = (section, paragraph, entry) => {
    if (section !== setting.section_ordinal || nodes.has(entry.objectNode)) return false;
    nodes.add(entry.objectNode);
    const group = groups.get(paragraph) ?? []; group.push(entry); groups.set(paragraph, group); return true;
  };
  for (const table of content.tables ?? []) {
    if (table.parentTableNode != null) continue;
    const policy = mixedInlineTablePolicy(table);
    if (policy.state !== "supported") return policy;
    const raw = table.sourceGeometry.out_margin;
    if (!Array.isArray(raw) || raw.length !== 4 || !raw.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff)) return unavailable("MissingTableOuterInsets");
    if (remaining < 1) return unavailable("MixedInlineLayoutLimit");
    const measured = hasNested
      ? measureNestedTable(content, table, measure, { maxRows: remaining, overflow: "visible" })
      : measureTableCells(table, content.paragraphs, measure, { origin: { x: 0, y: 0 }, padding: "source", maxRows: remaining, paragraphFlows: content.paragraphFlows });
    if (measured.state !== "measured") return measured;
    remaining -= measured.rowCount;
    const [left, right, top, bottom] = raw.map(hwpUnitPixels);
    measuredTables.set(table.tableNode, { table, measured, margins: { left, right, top, bottom } });
    if (!add(table.section, table.hostParagraph, { objectNode: table.tableNode, unit: table.anchorUnit, width: measured.grid.width + left + right, height: measured.grid.height + top + bottom })) return unavailable("AmbiguousMixedInlineObjects");
  }
  for (const drawing of content.drawings ?? []) {
    const source = drawing.source;
    if (!drawingAxisGeometry(source) || source.geometry.treat_as_character !== true || source.caption
      || drawingFillPlan(content, drawing).state !== "none" || source.paint?.shadow_type !== 0 || signedInt32(source.flow?.z_order) === null) return unavailable("UnsupportedMixedInlineDrawing");
    const context = drawingColumnContext(drawing, content.paragraphs, content.paragraphFlows);
    if (context.state !== "selected") return context;
    if (remaining < 1) return unavailable("MixedInlineLayoutLimit");
    const measured = measureInlineDrawingContent(drawing, content.paragraphs, context.declaration, measure, { maxRows: remaining });
    if (measured.state !== "measured") return measured;
    measuredDrawings.set(drawing.drawingNode, measured);
    if (!add(drawing.section, drawing.hostParagraph, { objectNode: drawing.drawingNode, unit: drawing.anchorUnit, width: measured.width, height: measured.height })) return unavailable("AmbiguousMixedInlineObjects");
  }
  for (const paragraph of content.paragraphs) {
    if (paragraph.tableCaption || paragraph.drawingCaption || paragraph.tableCell && paragraph.drawingText) return unavailable("AmbiguousMixedInlineOwnership");
    if (paragraph.tableCell) {
      const owner = ownership?.tables.get(`${paragraph.section}:${paragraph.tableCell.tableNode}`) ?? measuredTables.get(paragraph.tableCell.tableNode)?.table;
      if (!owner || owner.section !== paragraph.section || !owner.cells.some(cell => cell.listNode === paragraph.tableCell.listNode)) return unavailable("AmbiguousMixedInlineOwnership");
    }
    if (paragraph.drawingText) {
      const owners = (content.drawings ?? []).filter(d => d.section === paragraph.section && d.drawingNode === paragraph.drawingText.drawingNode
        && d.source?.text?.list_node === paragraph.drawingText.listNode);
      if (owners.length !== 1) return unavailable("AmbiguousMixedInlineOwnership");
    }
  }
  const body = content.paragraphs.filter(p => !p.tableCell && !p.drawingText && !p.tableCaption && !p.drawingCaption);
  const flows = (content.paragraphFlows ?? []).filter(flow => body.some(p => p.section === flow.section && p.paragraph === flow.paragraph));
  if (flows.length !== body.length || flows.some(flow => flow.host !== "body" || flow.top_level !== true)) return unavailable("UnsupportedMixedInlineFlow");
  const flowByParagraph = new Map();
  for (const flow of flows) {
    const key = `${flow.section}:${flow.paragraph}`;
    if (flowByParagraph.has(key)) return unavailable("UnsupportedMixedInlineFlow");
    flowByParagraph.set(key, flow);
  }
  const rows = [], measurements = [], seen = new Set(), splitTables = new Map();
  for (const paragraph of body) {
    if (paragraph.clipped || paragraph.section !== setting.section_ordinal || remaining < 1) return unavailable("MixedInlineLayoutLimit");
    const flow = flowByParagraph.get(`${paragraph.section}:${paragraph.paragraph}`);
    if (!flow) return unavailable("UnsupportedMixedInlineFlow");
    const columns = columnReferenceBoxes(reference.boxes.page, flow.column_declaration);
    if (columns.state !== "placed") return columns;
    const entries = groups.get(paragraph.paragraph);
    const measured = entries
      ? measureInlineObjectParagraph(paragraph, entries, columns.boxes[0].width, measure, { maxRows: remaining, allowLineOverflow: true })
      : layoutContent({ paragraphs: [paragraph], limited: false }, columns.boxes[0].width, measure, remaining, { documentBody: true });
    if (entries && measured.state !== "measured") return measured;
    if (measured.limited) return unavailable("MixedInlineLayoutLimit");
    if (entries?.length === 1 && measured.rows.some(row => row.height > reference.boxes.page.height) && measuredTables.has(entries[0].objectNode)) {
      const entry = measuredTables.get(entries[0].objectNode);
      const split = prepareSplitInlineTableHost(paragraph, measured, entry, { capacity: reference.boxes.page.height });
      if (split.state !== "prepared") return split;
      if (split.rows.length > remaining) return unavailable("MixedInlineLayoutLimit");
      remaining -= split.rows.length;
      rows.push(...split.rows); splitTables.set(entry.table.tableNode, { entry, split }); seen.add(paragraph.paragraph);
      continue;
    }
    remaining -= measured.rows.length;
    rows.push(...measured.rows.map(row => ({ ...row, ...(entries ? { inlineTables: entries.filter(entry => measuredTables.has(entry.objectNode)).map(entry => ({ tableNode: entry.objectNode, unit: entry.unit })) } : {}) })));
    if (entries) { measurements.push(measured); seen.add(paragraph.paragraph); }
  }
  if (seen.size !== groups.size) return unavailable("AmbiguousMixedInlineObjects");
  const oversized = rows.find(row => row.height > reference.boxes.page.height);
  if (oversized) return { ...unavailable("UnsupportedPageRow"), section: oversized.section, paragraph: oversized.paragraph,
    rowHeight: oversized.height, pageHeight: reference.boxes.page.height, inlineTables: oversized.inlineTables ?? [],
    ...(oversized.splitInlineTableNode !== undefined ? { tableNode: oversized.splitInlineTableNode, bandOrdinal: oversized.bandOrdinal,
      rowBand: splitTables.get(oversized.splitInlineTableNode)?.split.prepared.selected[oversized.bandOrdinal] } : {}) };
  const page = paginateBodyRows(rows, setting, flows, { columnZones: true, maxRows });
  if (page.state !== "paginated" || page.limited) return page;
  const resultRows = [...page.rows], boxes = [], placedDrawings = [];
  for (const [tableNode, { entry, split }] of splitTables) {
    if (split.cuts) {
      const placements = page.rows.filter(row => row.splitInlineTableNode === tableNode).map(row => ({ ...row,
        x: row.x + split.anchorX + split.prepared.margins.left,
        y: row.y + (row.cellCutOrdinal === 0 ? split.prepared.margins.top : 0) }));
      const result = projectCellPageCuts(entry.table, entry.measured, split.cuts, placements,
        { origin: { x: 0, y: 0 }, padding: "source", maxRows: maxRows - resultRows.length });
      if (result.state !== "placed") return result;
      resultRows.push(...result.rows); boxes.push(...result.boxes);
      continue;
    }
    const fragments = page.rows.filter(row => row.splitInlineTableNode === tableNode)
      .map(row => tablePageBandFragment(split.prepared, { ...row, x: row.x + split.anchorX }));
    const result = projectTablePageFragments(entry.table, entry.measured.grid, entry.measured.flows, { state: "planned", fragments },
      { origin: { x: 0, y: 0 }, padding: resolveTablePadding(entry.table, "source"), maxRows: maxRows - resultRows.length });
    if (result.state !== "placed") return result;
    resultRows.push(...result.rows); boxes.push(...result.boxes);
  }
  for (const measured of measurements) {
    const projected = projectInlineObjectPages(measured, page.rows);
    if (projected.state !== "placed") return projected;
    for (const placement of projected.objects) {
      const paper = placement.referenceBoxes?.paper, rectangle = placement.rectangle;
      if (!paper || ![paper.x, paper.y, paper.width, paper.height, paper.x + paper.width, paper.y + paper.height].every(Number.isFinite)
        || paper.width <= 0 || paper.height <= 0 || rectangle.x < paper.x || rectangle.y < paper.y
        || rectangle.x + rectangle.width > paper.x + paper.width + 1e-8 || rectangle.y + rectangle.height > paper.y + paper.height + 1e-8) return {
          ...unavailable("MixedInlinePaperOverflow"), section: placement.section, paragraph: placement.paragraph,
          objectNode: placement.objectNode, pageOrdinal: placement.pageOrdinal, rectangle, paper };
      const entry = measuredTables.get(placement.objectNode);
      let result;
      if (entry) result = layoutInlineTablePageContent(entry.table, entry.measured, placement, entry.margins, { maxRows: maxRows - resultRows.length });
      else {
        const drawing = content.drawings.find(d => d.drawingNode === placement.objectNode);
        const context = drawingColumnContext(drawing, content.paragraphs, content.paragraphFlows);
        if (context.state !== "selected") return context;
        result = layoutInlineDrawingPageContent(drawing, content.paragraphs, context.declaration, placement, measure, { maxRows: maxRows - resultRows.length, measurement: measuredDrawings.get(drawing.drawingNode) });
        placedDrawings.push({ section: drawing.section, drawingNode: drawing.drawingNode, hostParagraph: drawing.hostParagraph, anchorUnit: drawing.anchorUnit, rectangle: placement.rectangle, pageOrdinal: placement.pageOrdinal });
      }
      if (result.state !== "placed") return result;
      resultRows.push(...result.rows); boxes.push(...(result.boxes ?? []));
    }
  }
  const coverage = pageParagraphCoverage(content.paragraphs, resultRows);
  if (coverage.state !== "complete") return coverage;
  const nestedBounds = nestedTablePaperBounds(boxes);
  if (nestedBounds.state !== "contained") return nestedBounds;
  return { ...page, rows: resultRows.toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y || a.x - b.x), boxes, placedDrawings, spatialRows: true, pageLayoutMode: "measured-mixed-inline-body" };
}
