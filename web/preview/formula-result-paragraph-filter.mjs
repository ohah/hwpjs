// One display request only. Native still validates every selected edit range.
export function createFormulaResultParagraphFilter(editor, exportNames) {
  if (
    !exportNames.has("hwpx_edit_manual_formula_result_paragraphs") ||
    typeof editor.manualFormulaResultParagraphs !== "function"
  )
    return () => true;
  const sections = new Map();
  return (section, paragraph) => {
    if (!sections.has(section))
      sections.set(section, new Set(editor.manualFormulaResultParagraphs(section)));
    return sections.get(section).has(paragraph);
  };
}
