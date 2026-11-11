import { sourceTableCellWidthPlan } from './source-table-cell-width.mjs';

/** Format admission only. The common linear slot planner owns redistribution. */
export function validateSourceTableCellSizeFormat(format, table) {
  if (format !== 'hwp5' && format !== 'hwpx') throw Error('SourceTableCellWidthUnavailable');
  if (format === 'hwp5') {
    const source = table?.layoutSource;
    if (
      !source ||
      !table.sourceGeometry ||
      source.table_record_node !== table.tableNode ||
      source.rows !== table.rows ||
      source.columns !== table.columns ||
      source.object_extra_bytes !== 0 ||
      source.table_extra_bytes !== 0 ||
      source.cell_spacing !== 0 ||
      !Array.isArray(table.cells) ||
      !Number.isInteger(source.width) ||
      source.width <= 0 ||
      source.width > 0x7fffffff ||
      !Number.isInteger(source.height) ||
      source.height < 0 ||
      source.height > 0x7fffffff ||
      table.sourceGeometry.size_protected !== false ||
      table.sourceGeometry.locked !== false
    )
      throw Error('UnsupportedHwp5CellWidthMetadata');
    for (const cell of table.cells) {
      const raw = cell.layoutSource;
      if (
        !raw ||
        raw.table_record_node !== table.tableNode ||
        raw.list_node !== cell.listNode ||
        raw.extra_bytes !== 0 ||
        (raw.unknown !== null && raw.unknown !== 0) ||
        !Number.isInteger(raw.attributes) ||
        raw.attributes < 0 ||
        raw.attributes > 0xffffffff ||
        (raw.attributes & ~0x000f007f) !== 0 ||
        raw.protected !== false ||
        ![0, 1, 2].includes(raw.text_direction) ||
        ![0, 1, 2].includes(raw.line_wrap) ||
        ![0, 1, 2].includes(raw.vertical_alignment) ||
        !Number.isInteger(cell.width) ||
        cell.width <= 0 ||
        cell.width > 0x7fffffff ||
        !Number.isInteger(cell.height) ||
        cell.height < 0 ||
        cell.height > 0x7fffffff
      )
        throw Error('UnsupportedHwp5CellWidthMetadata');
    }
  }
}

export function sourceTableCellWidthPlanForFormat(format, table, request) {
  validateSourceTableCellSizeFormat(format, table);
  return sourceTableCellWidthPlan(table, request);
}
