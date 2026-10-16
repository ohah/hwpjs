// A pending table requires the same label capability for queries and edits.
export function hwpxFieldRangeTarget(editor, createdTablesPending, section, paragraph, start, end) {
  if (createdTablesPending && !editor.createdTableFieldLabelMode(section)) return null;
  return editor.fieldRangeTarget(section, paragraph, start, end);
}
