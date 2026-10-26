import { validateHwp5TextSourceProtection } from '../../js/hwp5-text-source-protection.mjs';

// Read only the native protection map; never derive field ranges in JavaScript.
export function retainedClickProtection(editor, section, failure) {
  if (
    !['UnsupportedCrossParagraphField', 'UnsupportedSectionControl'].includes(failure) ||
    editor.supportsTextSourceProtection?.() !== true
  )
    return null;
  const value = validateHwp5TextSourceProtection(
    editor.textSourceProtection(section),
    editor.paragraphCount(section),
  );
  const expected = failure === 'UnsupportedSectionControl' ? 'retained_memo' : 'retained_click';
  if (value.mode !== expected) throw new Error('InvalidHwp5TextSourceProtection');
  return value;
}
export function restoreRetainedWindowCandidate(paragraph) {
  if (
    paragraph.fieldTopologyEditableCandidate === true &&
    paragraph.windowContext !== true &&
    paragraph.clipped !== true
  )
    paragraph.editable = true;
  delete paragraph.fieldTopologyEditableCandidate;
  if (paragraph.fieldTopologyError === 'UnresolvedFieldMarkers')
    delete paragraph.fieldTopologyError;
}
