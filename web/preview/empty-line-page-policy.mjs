// Bounded rhwp-compatible overflow profile, not a complete Hancom layout rule.
function followsPaperContainedInlineTable(context) {
  const row = context.previousRow,
    paper = context.paper;
  const atomic =
    Number.isSafeInteger(row?.atomicInlineTable) &&
    row.atomicInlineTable >= 0 &&
    row.pageFitHeight === context.bottom - context.top;
  const inline =
    row?.inlineTables?.length === 1 &&
    Number.isSafeInteger(row.inlineTables[0]?.tableNode) &&
    row.inlineTables[0].tableNode >= 0 &&
    row.inlineTables[0].unit === 0 &&
    Number.isFinite(row.pageFitHeight) &&
    row.pageFitHeight > 0 &&
    row.pageFitHeight <= context.bottom - context.top;
  return (
    context.allowAtomicOverflow === true &&
    (atomic || inline) &&
    row.kind === "text" &&
    row.text === "\ufffc" &&
    row.startUnit === 0 &&
    row.endUnit === 1 &&
    row.pageOrdinal === context.pageOrdinal &&
    row.columnOrdinal === 0 &&
    row.y === context.top &&
    Number.isFinite(row.height) &&
    row.height > row.pageFitHeight &&
    row.y + row.height === context.cursor &&
    context.cursor > context.bottom &&
    Number.isFinite(paper?.y) &&
    Number.isFinite(paper?.height) &&
    paper.height > 0 &&
    context.cursor <= paper.y + paper.height
  );
}

export function canHideOverflowEmptyLine(row, flow, setting, context) {
  return (
    setting.hide_first_empty_line === true &&
    flow.empty_line_eligible === true &&
    flow.page_break !== true &&
    flow.column_break !== true &&
    context.singleColumn &&
    context.hasContent &&
    context.hiddenCount < 2 &&
    context.fits &&
    context.cursor >= context.top &&
    (context.cursor <= context.bottom || followsPaperContainedInlineTable(context)) &&
    context.cursor + row.height > context.bottom &&
    row.kind === "text" &&
    row.text === "" &&
    row.startUnit === 0 &&
    row.endUnit === 0 &&
    row.height > 0 &&
    !row.numberPrefix &&
    !row.sourceObjectAnchor &&
    (row.keepNextHeight ?? 0) === 0 &&
    row.tableNode === undefined &&
    row.splitInlineTableNode === undefined &&
    row.tableVerticalSource === undefined &&
    row.positionedFragments === undefined &&
    row.pageFitHeight === undefined &&
    (row.paragraphSource === undefined || row.paragraphSource.text === "")
  );
}
