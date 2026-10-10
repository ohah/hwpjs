// Normalize only the UI handle; native source IDs remain session-scoped.
export function attachHwp5Formulas(editor, content, available) {
  content.formulas = [];
  content.formulaErrors = [];
  content.formulaDefinitionAvailable = Boolean(editor) && available === true;
  if (!editor) return content;
  for (const section of new Set(content.paragraphs.map(row => row.section))) {
    try {
      for (const row of editor.formulaSources(section)) content.formulas.push({
        section, beginElement: row.source_node, owner: { paragraph: row.paragraph },
        formula: row.formula, last_result: row.last_result, derived: row.derived,
      });
    } catch (error) { content.formulaErrors.push({ section, error: error.message || String(error) }); }
  }
  return content;
}
