// Temporary projected children retain their original sources for both wrap
// reservation and final collision checks. Deduplicate only identical objects;
// conflicting identities remain visible to the inventory validators.
export function withInlineDrawingCollisionSources(content, layout) {
  const append = (original, owned) => [...new Set([...(original ?? []), ...(owned ?? [])])];
  return {
    ...content,
    drawings: append(content.drawings, layout.inlineDrawingSources),
    tables: append(content.tables, layout.inlineTableSources),
    paragraphs: append(content.paragraphs, layout.inlineDrawingParagraphs),
    pictures: append(content.pictures, layout.inlineDrawingPictures),
  };
}
