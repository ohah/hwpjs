/** Prefix input follows explicit native paths without moving the requested position. */
export function insertPrefix(editor, section, paragraph, text) {
  if (editor.canEdit(section, paragraph)) return editor.splice(section, paragraph, 0, 0, text);
  if (typeof editor.canEditOutsideField === 'function') {
    let outside = false;
    try {
      outside = editor.canEditOutsideField(section, paragraph, 0, 0);
    } catch (error) {
      if (error.message !== 'HwpxOutsideFieldQueryAbiUnavailable') throw error;
    }
    if (outside) return editor.splice(section, paragraph, 0, 0, text);
  }
  const nativeTargetQuery = typeof editor.fieldRangeTarget === 'function';
  if (nativeTargetQuery) {
    const target = editor.fieldRangeTarget(section, paragraph, 0, 0);
    if (target !== null) {
      if (
        !target ||
        !Number.isInteger(target.beginElement) ||
        target.beginElement < 0 ||
        target.beginElement > 0xffffffff ||
        target.start !== 0 ||
        !Number.isInteger(target.end) ||
        target.end < 0 ||
        target.end > 0xffffffff
      )
        throw new Error('UnsupportedFieldLabelRange');
      return editor.spliceFieldLabel(section, paragraph, target.beginElement, 0, 0, text);
    }
  }
  let anchored = false;
  try {
    editor.anchorText(section, paragraph);
    anchored = true;
  } catch (error) {
    if (
      ![
        'UnsupportedParagraphControl',
        'UnsupportedInlineControl',
        'MissingTextSite',
        'SourceBindingMismatch',
        'UnsupportedFieldLabel',
        'UnsupportedStructuralFieldEdit',
      ].includes(error.message)
    )
      throw error;
  }
  if (anchored) return editor.spliceAnchored(section, paragraph, 0, 0, text);
  if (nativeTargetQuery) throw new Error('UnsupportedFieldLabelRange');
  const targets = editor.fieldLabels(section, paragraph);
  const matches = targets.filter((target) => target.start <= 0 && target.end >= 0);
  if (matches.length !== 1) throw new Error('UnsupportedFieldLabelRange');
  return editor.spliceFieldLabel(section, paragraph, matches[0].beginElement, 0, 0, text);
}
