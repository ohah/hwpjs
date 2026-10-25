import {documentTextPageFitHeight} from "./document-text-page-fit.mjs";
// Placement consumes the full advance. Explicit fit extents cover discardable
// outer spacing and source atomic tables whose complete ink fits the paper.
export function pageRowFitHeight(row) {
  if (!row || !Number.isFinite(row.height) || row.height < 0) return null;
  if (!Object.hasOwn(row, "pageFitHeight")) return documentTextPageFitHeight(row) ?? row.height;
  return Number.isFinite(row.pageFitHeight) && row.pageFitHeight > 0
    && row.pageFitHeight <= row.height && !row.tableVerticalSource
    ? row.pageFitHeight : null;
}

export function pageRowRequiredHeight(row, keepNextHeight = 0) {
  const fit = pageRowFitHeight(row);
  if (fit === null || !Number.isFinite(keepNextHeight) || keepNextHeight < 0) return null;
  const required = keepNextHeight > 0 ? row.height + keepNextHeight : fit;
  return Number.isFinite(required) ? required : null;
}
