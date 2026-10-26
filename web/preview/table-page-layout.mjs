import { measureTableCells } from './table-cell-measurement.mjs';
import { planTablePages } from './table-page-plan.mjs';
import { projectTablePageFragments } from './table-page-fragments.mjs';
import { resolveTablePadding } from './table-source-insets.mjs';

/** Compose measurement, planning and projection; source policy stays explicit. */
export function layoutTablePages(
  table,
  paragraphs,
  setting,
  hostFlow,
  measure,
  { origin, padding, splitMode, maxRows = 20000, ...pageOptions } = {},
) {
  if (!['whole', 'row-bands'].includes(splitMode))
    return { state: 'unavailable', error: 'MissingTableSplitMode' };
  if (padding === 'source') {
    padding = resolveTablePadding(table, padding);
    if (!padding) return { state: 'unavailable', error: 'MissingTableSourceInsets' };
  }
  const measured = measureTableCells(table, paragraphs, measure, { origin, padding, maxRows });
  if (measured.state !== 'measured') return measured;
  const plan = planTablePages(table, measured.grid.rows, setting, hostFlow, {
    ...pageOptions,
    splitMode,
    maxRows,
  });
  if (plan.state !== 'planned') return plan;
  return projectTablePageFragments(table, measured.grid, measured.flows, plan, {
    origin,
    padding,
    maxRows,
  });
}
