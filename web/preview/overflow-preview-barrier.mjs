const key = (section, node) => `${section}:${node}`;

// A failed replacement scene cannot revoke a previously active safety barrier.
// Owners are rebuilt from the current Native observation, never old row IDs.
export function retainOverflowPreviewBarrier(content, layout, previousLayout) {
  if (
    layout?.state === 'paginated' ||
    !layout?.pageLayoutError ||
    !previousLayout?.previewReadOnlyTables?.length ||
    !['hwp5', 'hwpx'].includes(content?.format) ||
    !Array.isArray(content.tables) ||
    !content.tables.length ||
    !Array.isArray(content.paragraphs)
  )
    return layout;
  const owners = new Map(),
    hosts = new Set();
  for (const table of content.tables) {
    if (
      !table ||
      !Number.isSafeInteger(table.section) ||
      !Number.isSafeInteger(table.tableNode) ||
      !Number.isSafeInteger(table.hostParagraph)
    )
      return layout;
    owners.set(key(table.section, table.tableNode), {
      section: table.section,
      tableNode: table.tableNode,
      hostParagraph: table.hostParagraph,
      paragraphs: [],
      reason: 'IncompleteOverflowTableProjection',
      editableCells: [],
      sourceError: layout.pageLayoutError,
    });
    hosts.add(key(table.section, table.hostParagraph));
  }
  for (const p of content.paragraphs) {
    if (!p) return layout;
    owners.get(key(p.section, p.tableCell?.tableNode))?.paragraphs.push(p.paragraph);
  }
  const owns = (row) =>
    Boolean(
      row &&
      (owners.has(key(row.section, row.tableNode)) ||
        owners.has(key(row.section, row.positionOwnerTableNode)) ||
        hosts.has(key(row.section, row.paragraph))),
    );
  const anchorAllowed = (a) => !owners.has(key(a.section, a.tableNode));
  return {
    ...layout,
    rows: (layout.rows ?? []).map((row) =>
      owns(row) ? { ...row, previewOnly: true, editable: false, selectable: false } : row,
    ),
    boxes: (layout.boxes ?? []).map((box) =>
      owns(box) ? { ...box, previewOnly: true, editable: false, selectable: false } : box,
    ),
    tableAnchors: (layout.tableAnchors ?? []).filter(anchorAllowed),
    flowAnchors: (layout.flowAnchors ?? []).filter(anchorAllowed),
    previewReadOnlyTables: [...owners.values()],
    sourceCoverage: 'incomplete',
    documentPageNumbersExact: false,
  };
}
