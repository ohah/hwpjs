import { cellRowSplitPolicy } from "./cell-row-split-policy.mjs";
import { cellCutBodyOptionsError } from "./cell-cut-body-options.mjs";
import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { prepareTablePageBands } from "./table-page-bands.mjs";
import { paragraphCellOffset } from "./paragraph-cell-offset-policy.mjs";
import { supportsSplitTableCaption } from "./table-caption-fragment.mjs";

// Select measured cuts for oversized bands or splittable residual flow.
// Capacity, glyph boundaries and atomic row protection remain in the cut planner.
export function automaticCellCutMode(entry, setting, options = {}, flows = []) {
  if (
    entry?.table?.pagination?.page_break !== "cell" ||
    entry.splitMode !== "row-bands" ||
    entry.inline ||
    entry.inlineFlow ||
    entry.paperFlow ||
    (entry.captionReservation && !supportsSplitTableCaption(entry.table))
  )
    return "none";
  const reference = pageReferenceBoxes(setting, { x: 20, y: 20 });
  if (reference.state !== "placed") return "none";
  if (paragraphCellOffset(entry.table) !== null) return "required";
  const bands = prepareTablePageBands(
    entry.table,
    entry.rowHeights,
    entry.splitMode,
    entry.outerInsets,
  );
  if (bands.state !== "prepared") return "none";
  if (bands.rows.some((row) => row.height > reference.boxes.page.height)) return "required";
  // End captions can use required measured cuts. Residual cuts need separate
  // caption-aware page-boundary evidence; otherwise preserve whole row bands.
  if (entry.captionReservation) return "none";
  if (
    cellCutBodyOptionsError(options) ||
    !Array.isArray(flows) ||
    flows.some((flow) => !flow || flow.single_column === false || flow.column_break === true)
  )
    return "none";
  // Out-of-cell floating references need the full-cell projection path until
  // their cross-fragment ownership can be represented without clipping them.
  if (
    entry.measured?.flows instanceof Map &&
    [...entry.measured.flows.values()].some((flow) => flow.floatingTables?.length)
  )
    return "none";
  const policy = cellRowSplitPolicy(entry.table, entry.measured);
  return policy.state === "prepared" && policy.bands.some((band) => band.splittable)
    ? "residual"
    : "none";
}

export function requiresAutomaticCellCuts(entry, setting, options = {}, flows = []) {
  return automaticCellCutMode(entry, setting, options, flows) !== "none";
}
