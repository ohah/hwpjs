// Shared source ownership gate for whole-cell and CELL-cut projections.
export function validateNestedFloatingCellOwners(parent, entries) {
  const fail = (error) => ({ state: "unavailable", error });
  if (!Array.isArray(entries) || entries.length > 10000)
    return fail("InvalidNestedFloatingCellContent");
  const nodes = new Set(),
    anchors = new Set();
  for (const entry of entries) {
    const table = entry?.table,
      paragraph = entry?.paragraph;
    const identity = `${table?.section}:${table?.tableNode}`,
      anchor = `${table?.section}:${table?.hostParagraph}:${table?.anchorUnit}`;
    if (
      !table ||
      !paragraph ||
      ![
        table.section,
        table.tableNode,
        table.parentTableNode,
        table.parentListNode,
        table.hostParagraph,
        parent?.section,
        parent?.tableNode,
        parent?.listNode,
        paragraph.section,
        paragraph.paragraph,
      ].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff) ||
      nodes.has(identity) ||
      anchors.has(anchor) ||
      table.parentTableNode !== parent?.tableNode ||
      table.parentListNode !== parent?.listNode ||
      table.section !== parent?.section ||
      paragraph.tableCell?.tableNode !== parent?.tableNode ||
      paragraph.tableCell?.listNode !== parent?.listNode ||
      table.hostParagraph !== paragraph.paragraph ||
      table.section !== paragraph.section ||
      !Number.isInteger(table.anchorUnit) ||
      table.anchorUnit < 0 ||
      paragraph.text?.[table.anchorUnit] !== "\ufffc"
    )
      return fail("InvalidNestedFloatingTableOwner");
    nodes.add(identity);
    anchors.add(anchor);
  }
  return { state: "verified" };
}
