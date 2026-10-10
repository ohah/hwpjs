// Read-only grouping of native cell bindings, never a second editing model.
export function attachTables(editor, preview, content) {
  content.tables = [];
  content.tableBindingsErrors = [];
  for (const paragraph of content.paragraphs) delete paragraph.tableCell;
  if (!editor) return content;
  const displayed = new Map(content.paragraphs.map(p => [`${p.section}:${p.paragraph}`, p]));
  for (const section of preview.sections) {
    let bindings;
    try { bindings = editor.tableBindings(section.index); }
    catch (error) { content.tableBindingsErrors.push({ section: section.index, error: error.message }); continue; }
    const tables = new Map();
    const selectedTables = content.window ? new Set(bindings.filter(binding => displayed.has(`${section.index}:${binding.paragraph}`)).map(binding => binding.tableNode)) : null;
    for (const binding of bindings) {
      if (selectedTables && !selectedTables.has(binding.tableNode)) continue;
      let table = tables.get(binding.tableNode);
      if (!table) {
        table = { section: section.index, tableNode: binding.tableNode, rows: binding.rows, columns: binding.columns, cells: [], partial: false };
        tables.set(binding.tableNode, table);
      }
      let cell = table.cells.find(value => value.listNode === binding.listNode);
      if (!cell) {
        cell = { listNode: binding.listNode, row: binding.row, column: binding.column, rowSpan: binding.rowSpan, columnSpan: binding.columnSpan, width: binding.width, height: binding.height, paragraphs: [] };
        table.cells.push(cell);
      }
      const paragraph = displayed.get(`${section.index}:${binding.paragraph}`);
      if (!paragraph) { table.partial = true; continue; }
      if (paragraph.clipped) table.partial = true;
      cell.paragraphs.push(binding.paragraph);
      paragraph.tableCell = { tableNode: binding.tableNode, listNode: binding.listNode, row: binding.row, column: binding.column, rowSpan: binding.rowSpan, columnSpan: binding.columnSpan };
    }
    content.tables.push(...tables.values());
  }
  return content;
}
