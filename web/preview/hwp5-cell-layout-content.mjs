/** Native source insets/flags attach to current cells; no dimension cache. */
export function attachHwp5CellLayoutSources(editor, content) {
  content.cellLayoutSourceErrors = [];
  for (const table of content.tables)
    for (const cell of table.cells) {
      delete cell.layoutSource;
      delete cell.sourceMargin;
      delete cell.sourceVerticalAlignment;
      delete cell.sourceLineWrap;
      delete cell.sourceTextDirection;
    }
  if (!editor) return content;
  for (const section of new Set(content.tables.map((table) => table.section))) {
    try {
      const sources = editor.cellLayoutSources(section),
        byList = new Map();
      for (const row of sources) {
        if (byList.has(row.list_node)) throw new Error("AmbiguousCellLayoutSource");
        byList.set(row.list_node, row);
      }
      const selected = content.tables.filter((table) => table.section === section),
        attachments = [],
        seen = new Set();
      for (const table of selected)
        for (const cell of table.cells) {
          const row = byList.get(cell.listNode);
          if (!row || row.table_record_node !== table.tableNode || seen.has(cell.listNode))
            throw new Error("CellLayoutSourceBindingMismatch");
          seen.add(cell.listNode);
          attachments.push({ cell, row });
        }
      if (seen.size !== sources.length) throw new Error("IncompleteCellLayoutInventory");
      for (const { cell, row } of attachments) {
        cell.layoutSource = row;
        cell.sourceMargin = {
          has_margin: row.has_margin,
          margin: [...row.margins],
          header: row.header,
        };
        cell.sourceVerticalAlignment = row.vertical_alignment;
        cell.sourceLineWrap = row.line_wrap;
        cell.sourceTextDirection = row.text_direction;
      }
    } catch (error) {
      content.cellLayoutSourceErrors.push({ section, error: error.message });
    }
  }
  return content;
}
