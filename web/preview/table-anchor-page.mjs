/** Physical source-anchor proof; floating cell placement alone is not its text anchor. */
export function tableAnchorPage(table, anchor, layout, boxes) {
  const pages = layout.pages;
  if (!Array.isArray(pages)) return undefined;
  const logical = (layout.flowAnchors ?? []).filter(
    (row) => row.section === table.section && row.tableNode === table.tableNode,
  );
  let ordinal;
  if (logical.length) {
    if (logical.length !== 1) throw new Error("AmbiguousTableAnchorCoverage");
    const row = logical[0];
    if (
      row.kind !== "anchor" ||
      row.height !== 0 ||
      row.paragraph !== anchor.hostParagraph ||
      row.anchorUnit !== anchor.anchorUnit
    )
      throw new Error("InvalidTableAnchorCoverage");
    ordinal = row.pageOrdinal;
    if (!boxes.some((box) => box.pageOrdinal === ordinal))
      throw new Error("MissingTableAnchorCoveragePlacement");
  } else if (table.sourceGeometry.geometry.treat_as_character === true) {
    const selected = new Set(boxes.map((box) => box.pageOrdinal));
    if (selected.size === 1) ordinal = [...selected][0];
  }
  if (ordinal === undefined) return undefined;
  if (
    !Number.isSafeInteger(ordinal) ||
    ordinal < 0 ||
    ordinal > 0xffffffff ||
    pages.filter((page) => page?.section === table.section && page.ordinal === ordinal).length !== 1
  )
    throw new Error("InvalidTableAnchorCoverage");
  return ordinal;
}
