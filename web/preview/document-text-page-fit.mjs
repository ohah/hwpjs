// Document-metric text advances include trailing line spacing. At a page edge
// only its measured ink must fit; placement still consumes the full advance.
export function plainDocumentTextInkHeight(row) {
  if (
    row?.kind !== "text" ||
    row.textTop !== 0 ||
    typeof row.text !== "string" ||
    row.text.includes("\ufffc") ||
    row.inlineTables ||
    row.sourceObjectAnchor ||
    row.positionedFragments ||
    row.tableVerticalSource ||
    row.transform ||
    row.tableNode !== undefined ||
    row.splitInlineTableNode !== undefined ||
    row.atomicInlineTable !== undefined ||
    !Number.isFinite(row.textHeight) ||
    row.textHeight <= 0 ||
    !Number.isFinite(row.height) ||
    row.height < row.textHeight
  )
    return null;
  return row.textHeight;
}

// HWPX's general policy keeps the full advance. Explicit break context is
// derived separately by the body paginator.
export function documentTextPageFitHeight(row) {
  return row?.paragraphShape?.spacingFormat === "hwp5" ? plainDocumentTextInkHeight(row) : null;
}
