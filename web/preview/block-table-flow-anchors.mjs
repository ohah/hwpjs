// Bind a block table's source anchor to its first actually paginated band.
export function blockTableFlowAnchors(entries, rows) {
  const fail = () => ({ state: "unavailable", error: "InvalidBlockTableFlowAnchor" });
  if (!Array.isArray(entries) || !Array.isArray(rows)) return fail();
  const anchors = [],
    firstBands = new Map();
  for (const row of rows) {
    if (!row) return fail();
    if (
      row.tableIndex === undefined ||
      (row.bandOrdinal !== 0 && row.mandatoryCellFragment !== 0) ||
      row.repeatedTableHeader === true
    )
      continue;
    firstBands.set(row.tableIndex, firstBands.has(row.tableIndex) ? null : row);
  }
  for (const [index, entry] of entries.entries()) {
    if (entry?.inline || entry?.inlineFlow || entry?.paperFlow || entry?.host === undefined)
      continue;
    const table = entry?.table;
    if (
      !table ||
      ![table.section, table.hostParagraph, table.tableNode, table.anchorUnit].every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      ) ||
      entry.host.section !== table.section ||
      entry.host.paragraph !== table.hostParagraph ||
      typeof entry.host?.text !== "string" ||
      entry.host.text[table.anchorUnit] !== "\ufffc"
    )
      return fail();
    const row = firstBands.get(index);
    if (!row) return fail();
    if (
      row.section !== table.section ||
      row.paragraph !== table.hostParagraph ||
      !Number.isSafeInteger(row.pageOrdinal) ||
      row.pageOrdinal < 0 ||
      ![row.x, row.y].every(Number.isFinite)
    )
      return fail();
    anchors.push({
      kind: "anchor",
      height: 0,
      section: table.section,
      paragraph: table.hostParagraph,
      tableNode: table.tableNode,
      anchorUnit: table.anchorUnit,
      pageOrdinal: row.pageOrdinal,
      columnOrdinal: row.columnOrdinal,
      x: row.x,
      y: row.y,
      referenceBoxes: row.referenceBoxes,
    });
  }
  return { state: "bound", anchors };
}
