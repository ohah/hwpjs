import {pageRowFitHeight} from "./page-row-extents.mjs";
import { blockTableFlowAnchors } from "./block-table-flow-anchors.mjs";
import { prepareTablePageBands, tablePageBandFragment } from "./table-page-bands.mjs";
import { paginateBodyRows } from "./page-row-flow.mjs";
import { inlineTableGroupRows } from "./inline-table-group-rows.mjs";
import { tableHeightEvidence } from "./table-height-evidence.mjs";
import {paginateRepeatedTableBands} from "./repeated-table-band-pagination.mjs";
import { paragraphCellOffset } from "./paragraph-cell-offset-policy.mjs";
import { wholeTableNoteReferences } from "./whole-table-note-references.mjs";

// Explicit source order: body rows and one { tableIndex } slot per table.
export function planMultipleTablePages(entries, sequence, setting, flows, options = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 10000 || !Array.isArray(sequence) || !Array.isArray(flows) || flows.some(flow => !flow)) return unavailable("InvalidMultipleTablePlan");
  const maxRows = options.maxRows ?? 20000;
  if (options.paginateRows !== undefined && typeof options.paginateRows !== "function") return unavailable("InvalidPageFlowBounds");
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("InvalidPageFlowBounds");
  const prepared = [], hosts = new Set(), measuredFlows = new Set();
  let reservedRows = 0;
  for (const entry of entries) {
    const table = entry?.table;
    const key = table?.tableNode === undefined ? `${table?.section}:host:${table?.hostParagraph}` : `${table?.section}:table:${table.tableNode}`;
    const host = flows.find(flow => flow.section === table?.section && flow.paragraph === table?.hostParagraph);
    if (!table || !host || host.top_level !== true || hosts.has(key)) return unavailable("UnsupportedTablePageHost");
    if (entry.splitMode === "row-bands" && paragraphCellOffset(table) !== null) return unavailable("OffsetCellTableRequiresMeasuredCuts");
    hosts.add(key);
    const bands = prepareTablePageBands(table, entry.rowHeights, entry.splitMode, entry.outerInsets);
    if (bands.state !== "prepared") return bands;
    const leading=entry.inlineFlow?0:entry.inlineHostLeading??0;
    if(!Number.isFinite(leading)||leading<0||(leading>0&&entry.inline!==true))return unavailable("InvalidInlineTableHostLeading");
    if(leading>0){const last=bands.rows.at(-1),fit=pageRowFitHeight(last);if(fit===null||fit<=0||!Number.isFinite(last.height+leading))return unavailable("InvalidInlineTableHostLeading");last.height+=leading;last.pageFitHeight=fit;}

    if (entry.inlineFlow) {
      const flow = entry.inlineFlow;
      if (!Array.isArray(flow.anchors)) return unavailable("InvalidInlineTableMeasurement");
      const matches = flow.anchors.filter(anchor => anchor?.tableNode === table.tableNode), anchor = matches[0];
      if (flow.state !== "measured" || !Array.isArray(flow.rows) || !Array.isArray(flow.anchors) || matches.length !== 1 || !anchor || !Number.isSafeInteger(anchor.rowIndex) || anchor.rowIndex < 0 || anchor.rowIndex >= flow.rows.length || ![anchor.x, anchor.y, anchor.width, anchor.height].every(Number.isFinite) || entry.splitMode !== "whole") return unavailable("InvalidInlineTableMeasurement");
    }
    reservedRows += entry.paperFlow ? 1 : entry.inlineFlow ? measuredFlows.has(entry.inlineFlow) ? 0 : entry.inlineFlow.rows.length : bands.rows.length;
    if (entry.inlineFlow) measuredFlows.add(entry.inlineFlow);
    if (reservedRows > maxRows) return unavailable("TablePagePlanLimit");
    prepared.push(bands);
  }
  const rows = [], seen = new Set();
  for (const item of sequence) {
    if (!item || item.bandOrdinal !== undefined || item.repeatedTableHeader !== undefined) return unavailable("InvalidMultipleTablePlan");
    if (item.inlineTableIndices !== undefined) {
      if (item.tableIndex !== undefined) return unavailable("InvalidMultipleTablePlan");
      const grouped = inlineTableGroupRows(entries, item.inlineTableIndices);
      if (grouped.state !== "grouped") return grouped;
      for (const index of item.inlineTableIndices) {
        if (seen.has(index)) return unavailable("InvalidMultipleTablePlan");
        seen.add(index);
      }
      rows.push(...grouped.rows.map(row => ({ ...row, inlineTables: row.inlineTableAnchors.map(item => ({ unit: item.anchor.unit, tableNode: item.anchor.tableNode })) })));
      continue;
    }
    if (item.tableIndex === undefined) {
      if (++reservedRows > maxRows) return unavailable("TablePagePlanLimit");
      rows.push(item); continue;
    }
    const index = item.tableIndex;
    if (!Number.isSafeInteger(index) || index < 0 || index >= entries.length || seen.has(index)) return unavailable("InvalidMultipleTablePlan");
    seen.add(index);
    if (entries[index].paperFlow) {
      const table = entries[index].table;
      rows.push({ kind: "anchor", section: table.section, paragraph: table.hostParagraph, tableNode: table.tableNode, anchorUnit: table.anchorUnit, height: 0 });
      continue;
    }
    if (entries[index].inlineFlow) {
      const flow = entries[index].inlineFlow;
      if (flow.state !== "measured" || flow.anchors.length !== 1 || entries[index].splitMode !== "whole") return unavailable("InvalidInlineTableMeasurement");
      const anchor = flow.anchors[0];
      rows.push(...flow.rows.map((row, rowIndex) => rowIndex === anchor.rowIndex ? { ...row, tableIndex: index, bandOrdinal: 0, inlineTableAnchor: anchor, inlineTables: [{ unit: anchor.unit, tableNode: anchor.tableNode }] } : row));
    } else rows.push(...prepared[index].rows.map(row => ({ ...row, tableIndex: index,
      ...(entries[index].inline ? { inlineTableFit: { width: entries[index].measured.grid.width + prepared[index].margins.left + prepared[index].margins.right,
        paragraphShape: entries[index].host?.paragraphShape } } : {}) })));
  }
  if (seen.size !== entries.length) return unavailable("IncompleteMultipleTablePlan");
  const references = wholeTableNoteReferences(entries, rows, options.columnBottom);
  if (references.state !== "bound") return references;
  const layout = prepared.some(plan=>plan.repeatedHeader)?paginateRepeatedTableBands(references.rows,setting,flows,options,prepared)
    :(options.paginateRows ?? paginateBodyRows)(references.rows, setting, flows, options);
  if (layout.state !== "paginated") {
    const entry = Number.isSafeInteger(layout.tableIndex) ? entries[layout.tableIndex] : null;
    return entry ? { ...layout, tableNode: entry.table.tableNode, tableHeightEvidence: tableHeightEvidence(entry) } : layout;
  }
  if (layout.limited) return unavailable("TablePagePlanLimit");
  const plans = entries.map(() => ({ state: "planned", pages: layout.pages, height: layout.height, bodyRows: [], fragments: [] }));
  for (const row of layout.rows) {
    if(row.repeatedTableHeader===true){
      const fragment=tablePageBandFragment(prepared[row.tableIndex],row);
      fragment.y=row.y;
      (plans[row.tableIndex].repeatedHeaderFragments??=[]).push(fragment);
      continue;
    }
    for (const item of row.inlineTableAnchors ?? []) {
      const index = item.tableIndex, anchor = item.anchor;
      const fragment = tablePageBandFragment(prepared[index], { ...row, bandOrdinal: 0, inlineTableAnchor: anchor });
      if (![fragment.x, fragment.y].every(Number.isFinite)) return unavailable("InvalidTableOuterInsets");
      plans[index].fragments.push(fragment);
    }
    if (row.tableIndex === undefined) continue;
    const fragment = tablePageBandFragment(prepared[row.tableIndex], row);
    if (![fragment.x, fragment.y].every(Number.isFinite)) return unavailable("InvalidTableOuterInsets");
    plans[row.tableIndex].fragments.push(fragment);
  }
  const blockAnchors = blockTableFlowAnchors(entries, layout.rows);
  if (blockAnchors.state !== "bound") return blockAnchors;
  return { state: "planned", plans, pages: layout.pages, height: layout.height,
    ...((layout.flowAnchors?.length || blockAnchors.anchors.length) ? {flowAnchors:[...(layout.flowAnchors??[]),...blockAnchors.anchors]} : {}),
    ...(layout.pictureCaptionRows ? { pictureCaptionRows: layout.pictureCaptionRows } : {}),
    ...(layout.paperTableScenes ? { paperTableScenes: layout.paperTableScenes, paperTableFlowIterations: layout.paperTableFlowIterations } : {}),
    ...(layout.pictureReservations ? { pictureReservations: layout.pictureReservations } : {}), bodyRows: layout.rows.filter(row => row.tableIndex === undefined || row.inlineTableAnchor) };
}
