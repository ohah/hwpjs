import { prepareTablePageBands, tablePageBandFragment } from "./table-page-bands.mjs";
import { paginateBodyRows } from "./page-row-flow.mjs";
import { inlineTableGroupRows } from "./inline-table-group-rows.mjs";

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
    hosts.add(key);
    const bands = prepareTablePageBands(table, entry.rowHeights, entry.splitMode, entry.outerInsets);
    if (bands.state !== "prepared") return bands;
    if (entry.inlineFlow) {
      const flow = entry.inlineFlow;
      if (!Array.isArray(flow.anchors)) return unavailable("InvalidInlineTableMeasurement");
      const matches = flow.anchors.filter(anchor => anchor?.tableNode === table.tableNode), anchor = matches[0];
      if (flow.state !== "measured" || !Array.isArray(flow.rows) || !Array.isArray(flow.anchors) || matches.length !== 1 || !anchor || !Number.isSafeInteger(anchor.rowIndex) || anchor.rowIndex < 0 || anchor.rowIndex >= flow.rows.length || ![anchor.x, anchor.y, anchor.width, anchor.height].every(Number.isFinite) || entry.splitMode !== "whole") return unavailable("InvalidInlineTableMeasurement");
    }
    reservedRows += entry.inlineFlow ? measuredFlows.has(entry.inlineFlow) ? 0 : entry.inlineFlow.rows.length : bands.rows.length;
    if (entry.inlineFlow) measuredFlows.add(entry.inlineFlow);
    if (reservedRows > maxRows) return unavailable("TablePagePlanLimit");
    prepared.push(bands);
  }
  const rows = [], seen = new Set();
  for (const item of sequence) {
    if (!item || item.bandOrdinal !== undefined) return unavailable("InvalidMultipleTablePlan");
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
    if (entries[index].inlineFlow) {
      const flow = entries[index].inlineFlow;
      if (flow.state !== "measured" || flow.anchors.length !== 1 || entries[index].splitMode !== "whole") return unavailable("InvalidInlineTableMeasurement");
      const anchor = flow.anchors[0];
      rows.push(...flow.rows.map((row, rowIndex) => rowIndex === anchor.rowIndex ? { ...row, tableIndex: index, bandOrdinal: 0, inlineTableAnchor: anchor, inlineTables: [{ unit: anchor.unit, tableNode: anchor.tableNode }] } : row));
    } else rows.push(...prepared[index].rows.map(row => ({ ...row, tableIndex: index })));
  }
  if (seen.size !== entries.length) return unavailable("IncompleteMultipleTablePlan");
  const layout = (options.paginateRows ?? paginateBodyRows)(rows, setting, flows, options);
  if (layout.state !== "paginated") return layout;
  if (layout.limited) return unavailable("TablePagePlanLimit");
  const plans = entries.map(() => ({ state: "planned", pages: layout.pages, height: layout.height, bodyRows: [], fragments: [] }));
  for (const row of layout.rows) {
    for (const item of row.inlineTableAnchors ?? []) {
      const index = item.tableIndex, anchor = item.anchor;
      const fragment = tablePageBandFragment(prepared[index], { ...row, bandOrdinal: 0 });
      fragment.x = row.x + anchor.x + prepared[index].margins.left;
      fragment.y = row.y + prepared[index].margins.top;
      if (![fragment.x, fragment.y].every(Number.isFinite)) return unavailable("InvalidTableOuterInsets");
      plans[index].fragments.push(fragment);
    }
    if (row.tableIndex === undefined) continue;
    const fragment = tablePageBandFragment(prepared[row.tableIndex], row);
    if (row.inlineTableAnchor) {
      fragment.x = row.x + row.inlineTableAnchor.x + prepared[row.tableIndex].margins.left;
      fragment.y = row.y + prepared[row.tableIndex].margins.top;
    }
    if (![fragment.x, fragment.y].every(Number.isFinite)) return unavailable("InvalidTableOuterInsets");
    plans[row.tableIndex].fragments.push(fragment);
  }
  return { state: "planned", plans, pages: layout.pages, height: layout.height, ...(layout.pictureReservations ? { pictureReservations: layout.pictureReservations } : {}), bodyRows: layout.rows.filter(row => row.tableIndex === undefined || row.inlineTableAnchor) };
}
