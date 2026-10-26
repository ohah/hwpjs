import { paragraphSelectionOwner } from './paragraph-selection.mjs';

/** Collapsed caret only: source order within one owner, never a selection range. */
export function adjacentOwnedParagraph(paragraphs, point, forward) {
  if (!Array.isArray(paragraphs) || !point || point.createdCell || typeof forward !== 'boolean')
    return null;
  const identities = new Set();
  for (const paragraph of paragraphs) {
    if (
      !paragraph ||
      !Number.isSafeInteger(paragraph.section) ||
      paragraph.section < 0 ||
      !Number.isSafeInteger(paragraph.paragraph) ||
      paragraph.paragraph < 0 ||
      typeof paragraph.text !== 'string'
    )
      return null;
    const identity = `${paragraph.section}:${paragraph.paragraph}`;
    if (identities.has(identity)) return null;
    identities.add(identity);
  }
  const index = paragraphs.findIndex(
    (p) => p.section === point.section && p.paragraph === point.paragraph,
  );
  if (index < 0 || paragraphs[index].clipped) return null;
  const owner = paragraphSelectionOwner(paragraphs[index]);
  if (owner === null || owner === undefined) return null;
  for (let i = index + (forward ? 1 : -1); i >= 0 && i < paragraphs.length; i += forward ? 1 : -1) {
    const paragraph = paragraphs[i];
    if (paragraph.section !== point.section) return null;
    if (paragraphSelectionOwner(paragraph) !== owner) continue;
    if (paragraph.clipped) return null;
    return {
      ...point,
      paragraph: paragraph.paragraph,
      unit: forward ? 0 : paragraph.text.length,
      affinity: forward ? 'forward' : 'backward',
    };
  }
  return null;
}
