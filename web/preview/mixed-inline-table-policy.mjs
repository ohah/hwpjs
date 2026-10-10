// 혼합 경로의 표 지원 조건과 거부 사유를 함께 관리합니다.
export function mixedInlineTablePolicy(table) {
  const reasons = [];
  if (table.parentTableNode !== null) reasons.push("NestedTable");
  if (typeof table.sourceGeometry?.geometry?.treat_as_character !== "boolean") reasons.push("MissingTableGeometry");
  else if (table.sourceGeometry.geometry.treat_as_character !== true) reasons.push("FloatingTable");
  if (table.sourceCaption) reasons.push("TableCaption");
  if (!table.pagination) reasons.push("MissingTablePagination");
  else {
    if (!["cell", "none"].includes(table.pagination.page_break)) reasons.push("TablePageBreak");
    if (table.pagination.cell_spacing !== 0) reasons.push("TableCellSpacing");
  }
  if (table.cells?.some(cell => cell.sourceMargin?.header !== false)) reasons.push("TableHeaderCell");
  return reasons.length ? { state: "unavailable", error: "UnsupportedMixedInlineTable", section: table.section, tableNode: table.tableNode, reasons } : { state: "supported" };
}
