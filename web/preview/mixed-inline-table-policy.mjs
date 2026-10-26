import { tableGeometryFailureEvidence } from './table-geometry-failure-evidence.mjs';
// 혼합 경로의 표 지원 조건과 거부 사유를 함께 관리합니다.
export function mixedInlineTablePolicy(
  table,
  { whole = false, captions = false, diagnostics = [] } = {},
) {
  const reasons = [];
  if (table.parentTableNode !== null) reasons.push('NestedTable');
  if (typeof table.sourceGeometry?.geometry?.treat_as_character !== 'boolean')
    reasons.push('MissingTableGeometry');
  else if (table.sourceGeometry.geometry.treat_as_character !== true) reasons.push('FloatingTable');
  if (table.sourceCaption && !(whole === true && captions === true)) reasons.push('TableCaption');
  if (!table.pagination) reasons.push('MissingTablePagination');
  else {
    if (
      !['cell', 'none'].includes(table.pagination.page_break) &&
      !(whole && table.pagination.page_break === 'table')
    )
      reasons.push('TablePageBreak');
    if (table.pagination.cell_spacing !== 0) reasons.push('TableCellSpacing');
  }
  if (table.cells?.some((cell) => cell.sourceMargin?.header !== false))
    reasons.push('TableHeaderCell');
  return reasons.length
    ? {
        state: 'unavailable',
        error: 'UnsupportedMixedInlineTable',
        section: table.section,
        tableNode: table.tableNode,
        reasons,
        ...(reasons.includes('MissingTableGeometry')
          ? tableGeometryFailureEvidence(table, diagnostics)
          : {}),
      }
    : { state: 'supported' };
}
