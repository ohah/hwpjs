// Return a display-budget delta; native field-label permission stays authoritative.
export function projectFieldLabelDisplay(editor, paragraph, maxUnits) {
  if (!paragraph.fieldLabels?.length) return 0;
  try {
    const text = editor.fieldLabelDisplayText(paragraph.section, paragraph.paragraph + 1);
    if (typeof text !== "string" || text.length > maxUnits)
      throw new Error("FieldLabelDisplayBudgetExceeded");
    const delta = text.length - paragraph.text.length;
    paragraph.text = text;
    return delta;
  } catch (error) {
    paragraph.fieldReadOnlyReason = error.message;
    paragraph.fieldLabels = [];
    return 0;
  }
}
