export const inlineObjectAnchorKey = (section, paragraph, unit) =>
  `${section}:${paragraph}:${unit}`;

// Delegating compositors retain validated ownership while measuring elsewhere.
export function inlineObjectAnchorIndex(content) {
  const values = content.inlineObjectAnchors === undefined ? [] : content.inlineObjectAnchors,
    index = new Map(),
    identities = new Set();
  const invalid = () => ({ state: 'unavailable', error: 'InvalidInlineObjectAnchors' });
  if (!Array.isArray(values) || values.length > 10000) return invalid();
  for (const anchor of values) {
    if (
      !anchor ||
      ![anchor.section, anchor.paragraph, anchor.anchorUnit, anchor.node].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      )
    )
      return invalid();
    const id = `${anchor.section}:${anchor.node}`,
      key = inlineObjectAnchorKey(anchor.section, anchor.paragraph, anchor.anchorUnit);
    const owners = content.paragraphs?.filter(
      (p) => p.section === anchor.section && p.paragraph === anchor.paragraph,
    );
    if (
      identities.has(id) ||
      index.has(key) ||
      owners?.length !== 1 ||
      owners[0].text?.[anchor.anchorUnit] !== '\ufffc' ||
      content.tables?.some(
        (table) =>
          table.section === anchor.section &&
          table.hostParagraph === anchor.paragraph &&
          table.anchorUnit === anchor.anchorUnit,
      )
    )
      return invalid();
    identities.add(id);
    index.set(key, anchor);
  }
  return { state: 'indexed', index };
}
