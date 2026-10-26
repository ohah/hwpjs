/** Bounded geometry/identity diagnostics, never document text or a saved model. */
export function pageLayoutFailureSummary(result) {
  if (!result || result.state === "paginated") return null;
  const summary = {};
  for (const field of [
    "error",
    "sourceError",
    "layoutStage",
    "collisionStage",
    "overflowStage",
    "measurementStage",
    "policyReason",
    "anchorReason",
    "nestedAnchorReason",
    "nestedCellReason",
    "nestedCellPictureReason",
    "nestedFlowReason",
    "rowValidationStage",
  ]) {
    if (typeof result[field] === "string") summary[field] = result[field].slice(0, 256);
  }
  for (const field of [
    "section",
    "paragraph",
    "tableNode",
    "parentTableNode",
    "drawingNode",
    "pictureNode",
    "listNode",
    "pageOrdinal",
    "columnOrdinal",
    "noteNode",
    "noteListNode",
    "hostParagraph",
    "equationNode",
  ]) {
    if (Number.isSafeInteger(result[field]) && result[field] >= 0) summary[field] = result[field];
  }
  if (["footnote", "endnote"].includes(result.noteKind)) summary.noteKind = result.noteKind;
  for (const field of [
    "rawTableFlags",
    "unknownTableFlags",
    "rawCaptionFlags",
    "rawCaptionAttributes",
    "rawSectionFlags",
  ]) {
    if (Number.isInteger(result[field]) && result[field] >= 0 && result[field] <= 0xffffffff)
      summary[field] = result[field];
  }
  for (const field of ["verticalGrid", "horizontalGrid"]) {
    if (Number.isInteger(result[field]) && result[field] >= -32768 && result[field] <= 32767)
      summary[field] = result[field];
  }
  for (const field of [
    "rowHeight",
    "pageHeight",
    "cellCut",
    "cellBandStart",
    "cellBandEnd",
    "cellCapacity",
    "objectWidth",
    "availableWidth",
    "measuredWidth",
  ])
    if (Number.isFinite(result[field]) && result[field] >= 0) summary[field] = result[field];
  if (
    result.error === "InvalidTableCellMeasurement" &&
    result.measurementStage === "content-width"
  ) {
    if (Number.isFinite(result.availableWidth)) summary.availableWidth = result.availableWidth;
    for (const field of ["cellWidth", "horizontalInsets"]) {
      if (Number.isFinite(result[field]) && result[field] >= 0) summary[field] = result[field];
    }
  }
  if (Array.isArray(result.tableHeightEvidence?.cells)) {
    summary.tableHeightEvidence = result.tableHeightEvidence.cells
      .slice(0, 8)
      .map((cell) =>
        Object.fromEntries(
          ["listNode", "sourceHeight", "contentHeight", "growth", "rowCount"]
            .filter((key) => Number.isFinite(cell?.[key]) && cell[key] >= 0)
            .map((key) => [key, cell[key]]),
        ),
      );
  }
  const tablePolicy = result.tableHeightEvidence?.policy;
  if (tablePolicy && typeof tablePolicy === "object") {
    const policy = {};
    if (["whole", "row-bands"].includes(tablePolicy.splitMode))
      policy.splitMode = tablePolicy.splitMode;
    if (["none", "table", "cell"].includes(tablePolicy.storedPageBreak))
      policy.storedPageBreak = tablePolicy.storedPageBreak;
    for (const field of ["inline", "captionReserved"])
      if (typeof tablePolicy[field] === "boolean") policy[field] = tablePolicy[field];
    if (Object.keys(policy).length) summary.tablePaginationEvidence = policy;
  }
  const box = (value) =>
    value &&
    [
      value.x,
      value.y,
      value.width,
      value.height,
      value.x + value.width,
      value.y + value.height,
    ].every(Number.isFinite) &&
    value.width > 0 &&
    value.height > 0
      ? { x: value.x, y: value.y, width: value.width, height: value.height }
      : null;
  for (const field of ["rectangle", "body"]) {
    const value = box(result[field]);
    if (value) summary[field] = value;
  }
  if (Array.isArray(result.blockers)) {
    summary.blockerCount = result.blockers.length;
    summary.blockers = result.blockers.slice(0, 32).map((item) => ({
      kind: typeof item?.kind === "string" ? item.kind.slice(0, 32) : null,
      node: Number.isSafeInteger(item?.node) && item.node >= 0 ? item.node : null,
      rectangle: box(item?.rectangle),
    }));
  }
  return summary;
}
