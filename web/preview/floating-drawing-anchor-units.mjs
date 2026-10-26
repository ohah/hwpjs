// Validated outer-compositor anchors occupy no inline width in this paragraph.
export function floatingDrawingAnchorUnits(content, paragraph, inlineObjects = []) {
  const anchors = content.floatingDrawingAnchors ?? [],
    units = new Set(),
    nodes = new Set();
  if (!Array.isArray(anchors)) throw Error('InvalidFloatingDrawingAnchors');
  for (const anchor of anchors) {
    if (
      !anchor ||
      ![anchor.section, anchor.paragraph, anchor.node, anchor.anchorUnit].every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      )
    )
      throw Error('InvalidFloatingDrawingAnchors');
    if (anchor.section !== paragraph.section || anchor.paragraph !== paragraph.paragraph) continue;
    if (
      paragraph.text[anchor.anchorUnit] !== '\ufffc' ||
      units.has(anchor.anchorUnit) ||
      nodes.has(anchor.node) ||
      inlineObjects.some((o) => o.objectNode === anchor.node || o.unit === anchor.anchorUnit)
    )
      throw Error('AmbiguousFloatingDrawingAnchors');
    units.add(anchor.anchorUnit);
    nodes.add(anchor.node);
  }
  return [...units];
}
