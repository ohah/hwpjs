import { selectNotePagePolicy } from './note-page-policy.mjs';

// Native HWP5 policies and XML policies meet only at the normalized contract.
export function contentNotePagePolicy(content, section, kind) {
  if (content.format !== 'hwp5') return selectNotePagePolicy(content.noteShapes, section, kind);
  if (content.hwp5NoteShapeErrors?.length || !Array.isArray(content.hwp5NotePolicies))
    return { state: 'unavailable', error: 'IncompleteHwp5NotePagePolicies' };
  const selected = content.hwp5NotePolicies.filter(
    (row) => row.section === section && row.kind === kind,
  );
  return selected.length === 1
    ? selected[0]
    : { state: 'unavailable', error: 'AmbiguousNotePagePolicy' };
}
