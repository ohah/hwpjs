// Join by native ownership, never by displayed result text.
export function formulaAtParagraph(content, point) {
  if (!point) return null;
  if (content.format === "hwp5") {
    const rows = (content.formulas ?? []).filter(
      (row) => row.section === point.section && row.owner?.paragraph === point.paragraph,
    );
    return rows.length === 1 ? rows[0] : null;
  }
  if (content.format !== "hwpx") return null;
  const paragraph = content.paragraphs.find(
    (p) => p.section === point.section && p.paragraph === point.paragraph,
  );
  const cell = paragraph?.tableCell;
  if (!cell) return null;
  const rows = (content.formulas ?? []).filter(
    (row) =>
      row.section === point.section &&
      row.owner?.table === cell.tableNode &&
      row.owner.origin.column === cell.column &&
      row.owner.origin.row === cell.row,
  );
  return rows.length === 1 ? rows[0] : null;
}
