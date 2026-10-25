import { paginateBodyRows } from "./page-row-flow.mjs";
import { prepareTablePageBands, tablePageBandFragment } from "./table-page-bands.mjs";
import { paragraphCellOffset } from "./paragraph-cell-offset-policy.mjs";

/** Explicit planning mode; interpreting source pageBreak belongs to the caller. */
export function planTablePages(table, rowHeights, setting, hostFlow, { splitMode, beforeRows = [], afterRows = [], bodyFlows = [], outerInsets = 0, ...pageOptions } = {}) {
  if (!["whole", "row-bands"].includes(splitMode)) return { state: "unavailable", error: "MissingTableSplitMode" };
  if (!table || !hostFlow || hostFlow.top_level !== true || hostFlow.section !== table.section || hostFlow.paragraph !== table.hostParagraph) return { state: "unavailable", error: "UnsupportedTablePageHost" };
  if (splitMode === "row-bands" && paragraphCellOffset(table) !== null) return { state: "unavailable", error: "OffsetCellTableRequiresMeasuredCuts" };
  const prepared = prepareTablePageBands(table, rowHeights, splitMode, outerInsets);
  if (prepared.state !== "prepared") return prepared;
  if (![beforeRows, afterRows, bodyFlows].every(Array.isArray) || bodyFlows.some(flow => !flow) || [...beforeRows, ...afterRows].some(row => !row || row.bandOrdinal !== undefined)) return { state: "unavailable", error: "InvalidTableBodyRows" };
  const flows = [...bodyFlows];
  const existing = flows.find(flow => flow.section === hostFlow.section && flow.paragraph === hostFlow.paragraph);
  if (existing && JSON.stringify(existing) !== JSON.stringify(hostFlow)) return { state: "unavailable", error: "AmbiguousTablePageHost" };
  if (!existing) flows.push(hostFlow);
  const rows = prepared.rows;
  const layout = paginateBodyRows([...beforeRows, ...rows, ...afterRows], setting, flows, pageOptions);
  if (layout.state !== "paginated") return layout;
  if (layout.limited) return { state: "unavailable", error: "TablePagePlanLimit" };
  const fragments = layout.rows.filter(row => row.bandOrdinal !== undefined).map(row => tablePageBandFragment(prepared, row));
  if (fragments.some(fragment => ![fragment.x, fragment.y].every(Number.isFinite))) return { state: "unavailable", error: "InvalidTableOuterInsets" };
  return { state: "planned", pages: layout.pages, height: layout.height, bodyRows: layout.rows.filter(row => row.bandOrdinal === undefined), fragments };
}
