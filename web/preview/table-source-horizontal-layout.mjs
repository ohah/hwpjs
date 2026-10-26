import { sourceTableColumns } from './table-source-columns.mjs';
import { sourceTableRowHorizontals } from './source-table-row-horizontals.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';

// 공통 열 복원이 가능하면 유지합니다. 행별 실제 경계는 별도 격자 모드로 전달합니다.
export function tableSourceHorizontalLayout(table) {
  const uniform = sourceTableColumns(table);
  if (uniform.state === 'resolved')
    return { ...uniform, gridOptions: { columnWidths: uniform.columns.map(hwpUnitPixels) } };
  if (
    !['ConflictingSourceTableColumns', 'UnderdeterminedSourceTableColumns'].includes(
      uniform.error,
    ) &&
    !(
      uniform.error === 'InvalidSourceTableColumns' &&
      uniform.reason === 'NonPositiveSourceColumnSolution'
    )
  )
    return uniform;
  const local = sourceTableRowHorizontals(table);
  if (local.state !== 'resolved') return local;
  return {
    state: 'resolved',
    width: local.width,
    gridOptions: { sourceRowHorizontals: true },
    evidence: { ...local.evidence, rowWidths: local.rowWidths },
  };
}
