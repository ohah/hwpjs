// A decorative layered polygon owns no inline width; never exempt unknown controls.
export function floatingPolygonAnchorUnits(content, paragraph) {
  const units = new Set();
  for (const polygon of content.polygons ?? []) {
    if (polygon.section !== paragraph.section || polygon.hostParagraph !== paragraph.paragraph)
      continue;
    if (
      polygon.source?.group_context !== null ||
      polygon.source.geometry?.treat_as_character !== false ||
      ![2, 3].includes(polygon.source.text_wrap) ||
      polygon.source.affect_line_spacing !== false ||
      !Number.isSafeInteger(polygon.anchorUnit) ||
      paragraph.text[polygon.anchorUnit] !== "\ufffc" ||
      units.has(polygon.anchorUnit)
    )
      throw new Error("UnsupportedInlineGroupPolygonAnchor");
    units.add(polygon.anchorUnit);
  }
  return [...units];
}
