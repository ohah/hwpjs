import { planMultipleTablePages } from "./multiple-table-page-plan.mjs";
import { projectTablePageFragments } from "./table-page-fragments.mjs";
import { resolveTablePadding } from "./table-source-insets.mjs";

// Compose measured tables and explicit body order without choosing source policy.
export function layoutMeasuredMultipleTables(entries, sequence, setting, flows, options = {}) {
  const plan = planMultipleTablePages(entries, sequence, setting, flows, options);
  if (plan.state !== "planned") return plan;
  const maxRows = options.maxRows ?? 20000, rows = [...plan.bodyRows], boxes = [], flowPictures = [], tableCaptionBounds = [];
  if (rows.length + (plan.pictureCaptionRows?.length ?? 0) > maxRows) return { state: "unavailable", error: "TablePageProjectionLimit" };
  rows.push(...(plan.pictureCaptionRows ?? []));
  for (const [index, entry] of entries.entries()) {
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
  }
  return { state: "placed", rows: rows.toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || (a.columnOrdinal ?? 0) - (b.columnOrdinal ?? 0) || a.y - b.y || a.x - b.x), boxes, ...(tableCaptionBounds.length ? { tableCaptionBounds } : {}), ...(flowPictures.length ? { flowPictures } : {}), ...(plan.pictureReservations ? { pictureReservations: plan.pictureReservations } : {}), pages: plan.pages, height: plan.height, spatialRows: true, pageLayoutMode: "measured-body", limited: false };
}
