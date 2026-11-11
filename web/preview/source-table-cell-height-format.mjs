import { validateSourceTableCellSizeFormat } from './source-table-cell-width-format.mjs';
import { sourceTableCellHeightPlan } from './source-table-cell-height.mjs';
export function sourceTableCellHeightPlanForFormat(format, table, request) {
  try {
    validateSourceTableCellSizeFormat(format, table);
  } catch (error) {
    if (format === 'hwp5') throw Error('UnsupportedHwp5CellHeightMetadata');
    throw error;
  }
  return sourceTableCellHeightPlan(table, request);
}
