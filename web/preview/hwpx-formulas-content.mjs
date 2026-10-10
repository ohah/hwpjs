// Current formulas are a native projection, never a mutable UI cache.
export function attachHwpxFormulas(editor, content) {
  if (content.window && !Array.isArray(content.tables)) throw new Error("MissingWindowTableOwnership");
  content.formulas = [];
  content.formulaErrors = [];
  content.formulaDefinitionAvailable = typeof editor.setFormulaDefinition === "function";
  const sections = [...new Set(content.paragraphs.map(paragraph => paragraph.section))];
  for (const section of sections) {
    try {
      if (editor.formulaSources(section).length === 0) continue;
      const selected = content.window ? new Set(content.tables.filter(table => table.section === section).map(table => table.tableNode)) : null;
      for (const row of editor.formulaCurrent(section)) {
        if (selected && !selected.has(row.owner.table)) continue;
        content.formulas.push({ section, beginElement: row.begin_element, owner: row.owner, ...row.values });
      }
    } catch (error) {
      content.formulaErrors.push({ section, error: error.message });
    }
  }
  return content;
}
