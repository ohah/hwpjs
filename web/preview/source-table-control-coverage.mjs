// The existing source engine represents table-only hosts by table cells rather
// than editable U+FFFC rows. Verify that ownership for coverage, not for paint.
export function sourceTableControlCoverage(content, layout, rows) {
  const unavailable = () => ({ state: "unavailable", error: "IncompleteSourceTableControlCoverage" });
  if (!Array.isArray(content?.tables) || !Array.isArray(content.paragraphs) || !Array.isArray(layout?.tableAnchors) || !Array.isArray(layout.boxes) || !Array.isArray(rows)) return unavailable();
  const controls = [], positions = new Set();
  for (const anchor of layout.tableAnchors) {
    if (!anchor) return unavailable();
    const table = content.tables.find(table => table?.section === anchor.section && table.tableNode === anchor.tableNode);
    const paragraph = content.paragraphs.find(p => p?.section === anchor.section && p.paragraph === anchor.hostParagraph);
    const key = `${anchor.section}:${anchor.hostParagraph}:${anchor.anchorUnit}`;
    if (!table || table.hostParagraph !== anchor.hostParagraph || table.anchorUnit !== anchor.anchorUnit || !Number.isSafeInteger(anchor.anchorUnit)
      || typeof paragraph?.text !== "string" || paragraph.text[anchor.anchorUnit] !== "\ufffc" || positions.has(key) || !Array.isArray(table.cells) || !table.cells.length
      || table.cells.some(cell => !cell || !layout.boxes.some(box => box?.section === table.section && box.tableNode === table.tableNode && box.listNode === cell.listNode))) return unavailable();
    positions.add(key);
    if (rows.some(row => row?.kind === "text" && row.section === anchor.section && row.paragraph === anchor.hostParagraph && row.startUnit <= anchor.anchorUnit && row.endUnit > anchor.anchorUnit)) continue;
    controls.push({ kind: "text", section: anchor.section, paragraph: anchor.hostParagraph,
      startUnit: anchor.anchorUnit, endUnit: anchor.anchorUnit + 1, text: "\ufffc" });
  }
  return { state: "verified", rows: controls };
}
