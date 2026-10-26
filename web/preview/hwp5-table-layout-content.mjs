/** Attach immutable declarations to current table inventory; never overwrite cells. */
export function attachHwp5TableLayoutSources(editor, content) {
  content.tableLayoutSourceErrors = [];
  for (const table of content.tables) delete table.layoutSource;
  if (!editor) return content;
  const sections = new Set(content.tables.map((table) => table.section));
  for (const section of sections) {
    try {
      const sources = editor.tableLayoutSources(section),
        byNode = new Map();
      for (const source of sources) {
        if (byNode.has(source.table_record_node)) throw new Error("AmbiguousTableLayoutSource");
        byNode.set(source.table_record_node, source);
      }
      const tables = content.tables.filter((table) => table.section === section),
        attachments = [];
      if (sources.length !== tables.length) throw new Error("IncompleteTableLayoutInventory");
      for (const table of tables) {
        const source = byNode.get(table.tableNode);
        if (!source || source.rows !== table.rows || source.columns !== table.columns)
          throw new Error("TableLayoutSourceBindingMismatch");
        if (
          !Number.isInteger(table.hostParagraph) ||
          table.hostParagraph < 0 ||
          !content.paragraphs.some(
            (row) => row.section === section && row.paragraph === table.hostParagraph,
          )
        )
          throw new Error("MissingTableLayoutHost");
        attachments.push({ table, source });
      }
      for (const { table, source } of attachments) table.layoutSource = source;
    } catch (error) {
      content.tableLayoutSourceErrors.push({ section, error: error.message });
    }
  }
  return content;
}
