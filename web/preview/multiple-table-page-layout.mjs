import { planMultipleTablePages } from "./multiple-table-page-plan.mjs";
import { projectTablePageFragments } from "./table-page-fragments.mjs";
import { resolveTablePadding } from "./table-source-insets.mjs";
import { layoutMandatoryCellBreakTable } from "./mandatory-cell-break-table-layout.mjs";
import {projectRepeatedTableHeaders} from "./repeated-table-header-projection.mjs";
import { requiresAutomaticCellCuts } from "./automatic-cell-cut-policy.mjs";

// Compose measured tables and explicit body order without choosing source policy.
export function layoutMeasuredMultipleTables(entries, sequence, setting, flows, options = {}) {
  if (Array.isArray(entries) && entries.some(entry => entry?.measured?.flows instanceof Map
    && (requiresAutomaticCellCuts(entry, setting, options, flows) || [...entry.measured.flows.values()].some(flow => flow?.cellPageBreaks?.length)
      ||entry.table?.pagination?.page_break==="cell"&&entry.table.pagination.repeat_header===true&&entry.table.cells?.some(cell=>cell?.sourceMargin?.header===true)))) return layoutMandatoryCellBreakTable(entries, sequence, setting, flows, options);
  const plan = planMultipleTablePages(entries, sequence, setting, flows, options);
  if (plan.state !== "planned") return plan;
  const maxRows = options.maxRows ?? 20000, rows = [...plan.bodyRows], boxes = [], flowPictures = [], tableCaptionBounds = [], repeatedTableHeaderRows=[],repeatedTableHeaderBoxes=[];
  if (rows.length + (plan.pictureCaptionRows?.length ?? 0) > maxRows) return { state: "unavailable", error: "TablePageProjectionLimit" };
  rows.push(...(plan.pictureCaptionRows ?? []));
  for (const [index, entry] of entries.entries()) {
    if (entry.paperFlow) {
      const scene = plan.paperTableScenes?.find(scene => scene.section === entry.table.section && scene.tableNode === entry.table.tableNode);
      if (!scene) return { state: "unavailable", error: "MissingPaperTableProjection" };
      if (rows.length + scene.rows.length > maxRows) return { state: "unavailable", error: "TablePageProjectionLimit" };
      rows.push(...scene.rows); boxes.push(...scene.boxes); flowPictures.push(...(scene.flowPictures ?? []));
      tableCaptionBounds.push(...(scene.tableCaptionBounds ?? []));
      continue;
    }
    if (entry.measured?.state !== "measured") return { state: "unavailable", error: "IncompleteTableMeasurement" };
    if (!Array.isArray(entry.measured.grid?.rows) || entry.rowHeights.length !== entry.measured.grid.rows.length || entry.rowHeights.some((height, index) => height !== entry.measured.grid.rows[index])) return { state: "unavailable", error: "AmbiguousTableMeasurement" };
    if (rows.length >= maxRows) return { state: "unavailable", error: "TablePageProjectionLimit" };
    const padding = resolveTablePadding(entry.table, entry.padding);
    if (entry.padding === "source" && !padding) return { state: "unavailable", error: "MissingTableSourceInsets" };
    const projected = projectTablePageFragments(entry.table, entry.measured.grid, entry.measured.flows, plan.plans[index], { origin: entry.origin, padding, maxRows: maxRows - rows.length });
    if (projected.state !== "placed") return projected;
    rows.push(...projected.rows); boxes.push(...projected.boxes);
    tableCaptionBounds.push(...(projected.tableCaptionBounds ?? []));
    flowPictures.push(...(projected.flowPictures ?? []));
    const repeated=projectRepeatedTableHeaders(entry.table,entry.measured,plan.plans[index].repeatedHeaderFragments??[],{origin:entry.origin,padding,maxRows:maxRows-rows.length-repeatedTableHeaderRows.length});
    if(repeated.state!=="placed")return repeated;
    repeatedTableHeaderRows.push(...repeated.rows);repeatedTableHeaderBoxes.push(...repeated.boxes);
  }
  if(rows.length+repeatedTableHeaderRows.length>maxRows)return {state:"unavailable",error:"TablePageProjectionLimit"};
  return { state: "placed", rows: rows.toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || (a.columnOrdinal ?? 0) - (b.columnOrdinal ?? 0) || a.y - b.y || a.x - b.x), boxes, ...(flowPictures.length ? { flowPictures } : {}),
    ...(plan.flowAnchors?.length ? {flowAnchors:plan.flowAnchors} : {}),
    ...(plan.paperTableScenes ? { paperTableScenes: plan.paperTableScenes, paperTableFlowIterations: plan.paperTableFlowIterations } : {}),
    ...(tableCaptionBounds.length ? { tableCaptionBounds } : {}),
    ...(repeatedTableHeaderRows.length?{repeatedTableHeaderRows,repeatedTableHeaderBoxes}:{}),
    ...(plan.pictureReservations ? { pictureReservations: plan.pictureReservations } : {}), pages: plan.pages, height: plan.height, spatialRows: true, pageLayoutMode: "measured-body", limited: false };
}
