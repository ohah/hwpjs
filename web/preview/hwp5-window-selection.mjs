// Validate display coverage only; native ownership and edit policy stay separate.
export function validateHwp5WindowSelection(content) {
  const window = content.window,
    uint = (value) => Number.isSafeInteger(value) && value >= 0;
  if (
    !window ||
    !Array.isArray(content.paragraphs) ||
    ![
      content.totalParagraphs,
      window.requestedOffset,
      window.requestedCount,
      window.contextCount,
    ].every(uint) ||
    window.requestedOffset > content.totalParagraphs ||
    window.requestedCount > content.totalParagraphs - window.requestedOffset ||
    window.paragraphOffset !== window.requestedOffset ||
    window.paragraphCount !== window.requestedCount ||
    content.paragraphs.length !== window.requestedCount + window.contextCount
  )
    throw new Error("InvalidHwp5WindowSelection");
  const identities = new Set();
  let previous = -1,
    selected = 0;
  for (const row of content.paragraphs) {
    if (
      !row ||
      ![row.section, row.paragraph, row.windowOrdinal].every(uint) ||
      row.windowOrdinal >= content.totalParagraphs ||
      row.windowOrdinal <= previous ||
      row.clipped ||
      typeof row.text !== "string"
    )
      throw new Error("InvalidHwp5WindowSelection");
    previous = row.windowOrdinal;
    const key = `${row.section}:${row.paragraph}`;
    if (identities.has(key)) throw new Error("InvalidHwp5WindowSelection");
    identities.add(key);
    const context =
      row.windowOrdinal < window.requestedOffset ||
      row.windowOrdinal >= window.requestedOffset + window.requestedCount;
    if (
      row.windowContext !== context ||
      (context && (row.editable !== false || row.selectable !== false)) ||
      (content.readOnly && row.editable !== false)
    )
      throw new Error("InvalidHwp5WindowSelection");
    if (!context) {
      if (row.windowOrdinal !== window.requestedOffset + selected)
        throw new Error("InvalidHwp5WindowSelection");
      selected++;
    }
  }
  if (selected !== window.requestedCount) throw new Error("InvalidHwp5WindowSelection");
  return {
    offset: window.requestedOffset,
    count: selected,
    contextCount: window.contextCount,
    completeDocument: content.paragraphs.length === content.totalParagraphs,
  };
}
