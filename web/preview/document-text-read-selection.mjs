import { displayDocumentParagraph } from '../../js/document-text-coordinates.mjs';
import { paragraphSelectionOwner } from './paragraph-selection.mjs';
// This only marks the one freshly Native-resolved range readable. Editable and
// write/history capabilities are not changed, even on a read-only host.
export function admitDocumentTextReadSelection(content, observation) {
  const target = observation?.target;
  if (
    content?.format !== observation?.format ||
    observation?.scope !== 'native-document-text-selection' ||
    observation.executionAuthority !== false ||
    !target
  )
    throw Error('InvalidDocumentTextReadSelection');
  if (target.kind === 'created-cell') return content; // Typed cells use their own layout identity.
  if (target.kind !== 'paragraph' || !Array.isArray(content.paragraphs))
    throw Error('InvalidDocumentTextReadSelection');
  const paragraph = displayDocumentParagraph(observation.format, target.paragraph);
  if (paragraph === undefined) throw Error('InvalidDocumentTextReadSelection');
  let found;
  for (const row of content.paragraphs) {
    if (row.section !== target.section || row.paragraph !== paragraph) continue;
    if (found) throw Error('AmbiguousDocumentTextReadOwner');
    found = row;
  }
  if (
    !found ||
    found.clipped ||
    found.text !== observation.beforeText ||
    typeof paragraphSelectionOwner(found) !== 'string'
  )
    throw Error('DocumentTextReadOwnerUnavailable');
  return {
    ...content,
    paragraphs: content.paragraphs.map((row) =>
      row === found ? { ...row, selectable: true } : row,
    ),
  };
}
