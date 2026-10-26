import { planCellTableBodyPages } from "./table-cell-body-plan.mjs";
import { projectCellPageCuts } from "./table-cell-page-projection.mjs";

// Explicit measured block flow; this does not interpret XML pageBreak values.
export function layoutMeasuredCellBody(table, measured, setting, hostFlow, options = {}) {
  const plan = planCellTableBodyPages(table, measured, setting, hostFlow, options);
  if (plan.state !== "planned") return plan;
  const remaining = (options.maxRows ?? 20000) - plan.bodyRows.length;
  if (remaining < 1)
    return {
      state: "unavailable",
      error: "CellPageProjectionLimit",
      layoutStage: "cell-body-row-budget",
      tableNode: table.tableNode,
      bodyRows: plan.bodyRows.length,
      maxRows: options.maxRows ?? 20000,
    };
  const cells = projectCellPageCuts(table, measured, plan.cuts, plan.placements, {
    origin: options.origin,
    padding: options.padding,
    frameInsets: options.frameInsets,
    maxRows: remaining,
    maxInspections: options.maxInspections,
    maxFragments: options.maxPages,
  });
  if (cells.state !== "placed") return cells;
  return {
    ...cells,
    rows: [...plan.bodyRows, ...cells.rows].toSorted(
      (a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y || a.x - b.x,
    ),
    pages: plan.pages,
    height: plan.height,
    pageLayoutMode: "measured-body",
  };
}
