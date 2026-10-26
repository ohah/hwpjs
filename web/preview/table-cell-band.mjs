import { rowVisualHeight } from "./row-geometry.mjs";

// Translate both endpoints from the same local coordinate system. Adding a
// height after translation can overlap an adjacent row by one floating ULP.
export function tableCellBand(offset, row) {
  return { start: offset + row.y, end: offset + (row.y + tableCellRowExtent(row)) };
}

// Advance can be zero or smaller than ink. Legacy metric-only rows keep their extent.
export function tableCellRowExtent(row) {
  if (!row || !Number.isFinite(row.height) || row.height < 0) return NaN;
  if (row.kind !== "text" || row.textHeight === undefined) return row.height;
  if (
    !Number.isFinite(row.textHeight) ||
    row.textHeight < 0 ||
    (row.textTop !== undefined && (!Number.isFinite(row.textTop) || row.textTop < 0))
  )
    return NaN;
  if (row.text === "" && !row.numberPrefix) return row.height;
  return rowVisualHeight(row);
}

export { isZeroAdvanceTextAnchor as isZeroAdvanceCellAnchor } from "./row-geometry.mjs";

export function tableCellFlowExtent(flow) {
  if (!Array.isArray(flow?.rows) || !Number.isFinite(flow.height) || flow.height < 0) return NaN;
  let end = flow.height;
  for (const row of flow.rows) {
    if (!row || !Number.isFinite(row.y) || row.y < 0) return NaN;
    end = Math.max(end, row.y + tableCellRowExtent(row));
  }
  return end;
}
