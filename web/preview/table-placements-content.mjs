export function attachTablePlacements(editor, sections, content, paragraphOffset = 0) {
  content.tablePlacementsErrors = [];
  for (const section of sections) {
    let placements;
    try {
      placements = editor.tablePlacements(section.index);
    } catch (error) {
      content.tablePlacementsErrors.push({ section: section.index, error: error.message });
      continue;
    }
    const tables = new Map(
      content.tables.filter((t) => t.section === section.index).map((t) => [t.tableNode, t]),
    );
    for (const placement of placements) {
      const table = tables.get(placement.tableNode);
      if (!table) continue;
      table.hostParagraph = placement.paragraph + paragraphOffset;
      if (Object.hasOwn(placement, "anchorUnit")) table.anchorUnit = placement.anchorUnit;
      table.parentTableNode = placement.parentTableNode;
      table.parentListNode = placement.parentListNode;
    }
  }
  return content;
}
