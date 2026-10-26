// Only whole inline table anchors: all measured cell rows share this host line's page.
// This does not assign references to a split CELL fragment.
export function sourceTableLineReferences(anchors, tables) {
  const references = [],
    seen = new Set();
  if (!Array.isArray(anchors) || !(tables instanceof Map))
    throw new Error('InvalidSourceTableLineReferences');
  for (const anchor of anchors) {
    if (anchor.createdTableIdentity !== undefined) continue;
    const source = tables.get(anchor.tableNode);
    if (!source || seen.has(anchor.tableNode) || !(source.measured?.flows instanceof Map))
      throw new Error('InvalidSourceTableLineReferences');
    seen.add(anchor.tableNode);
    const table = source.table;
    if (
      !table ||
      table.tableNode !== anchor.tableNode ||
      table.sourceGeometry?.geometry?.treat_as_character !== true ||
      !Array.isArray(table.cells)
    )
      throw new Error('InvalidSourceTableLineReferences');
    for (const cell of table.cells) {
      const flow = source.measured.flows.get(cell.listNode);
      if (!Array.isArray(cell.paragraphs) || !Array.isArray(flow?.rows))
        throw new Error('InvalidSourceTableLineReferences');
      for (const row of flow.rows) {
        if (row.kind !== 'text') continue;
        if (
          row.section !== table.section ||
          !cell.paragraphs.includes(row.paragraph) ||
          !Number.isSafeInteger(row.startUnit) ||
          row.startUnit < 0 ||
          !Number.isSafeInteger(row.endUnit) ||
          row.endUnit < row.startUnit
        )
          throw new Error('InvalidSourceTableLineReferences');
        references.push({
          kind: 'text',
          section: row.section,
          paragraph: row.paragraph,
          startUnit: row.startUnit,
          endUnit: row.endUnit,
        });
      }
    }
  }
  return references;
}
