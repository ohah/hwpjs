// Restrict source attachment inventory, not the native edit/ownership model.
export function hwp5WindowTableSourceEditor(editor, content) {
  const scoped = Object.create(editor);
  const select = (section, query, key, selected, error) => {
    const rows = query(section),
      seen = new Set();
    for (const row of rows) {
      if (seen.has(row[key])) throw new Error(error);
      seen.add(row[key]);
    }
    return rows.filter((row) => selected.has(row[key]));
  };
  const tables = (section) => content.tables.filter((row) => row.section === section);
  const nodes = (section) => new Set(tables(section).map((row) => row.tableNode));
  scoped.tableLayoutSources = (section) =>
    select(
      section,
      (index) => editor.tableLayoutSources(index),
      "table_record_node",
      nodes(section),
      "AmbiguousTableLayoutSource",
    );
  scoped.tableAnchors = (section) =>
    select(
      section,
      (index) => editor.tableAnchors(index),
      "table_record_node",
      nodes(section),
      "AmbiguousTableDisplayAnchor",
    );
  scoped.cellLayoutSources = (section) =>
    select(
      section,
      (index) => editor.cellLayoutSources(index),
      "list_node",
      new Set(tables(section).flatMap((row) => row.cells.map((cell) => cell.listNode))),
      "AmbiguousCellLayoutSource",
    );
  return scoped;
}
