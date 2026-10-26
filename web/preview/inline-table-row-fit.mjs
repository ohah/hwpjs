import { paragraphLineGeometry } from './paragraph-geometry.mjs';

/** Original inline width may exceed a column, but cannot exceed physical paper. */
export function inlineTableRowFitsPaper(row, context) {
  if (row.inlineTableFit === undefined) return true;
  const { width, paragraphShape } = row.inlineTableFit ?? {};
  const { column, paper } = context ?? {};
  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    !column ||
    !paper ||
    ![column.x, column.width, paper.x, paper.width, paper.x + paper.width].every(Number.isFinite) ||
    column.width <= 0 ||
    paper.width <= 0
  )
    return null;
  const line = paragraphLineGeometry(paragraphShape, column.width, width, true);
  const start = column.x + line.x,
    end = start + width;
  if (![start, end].every(Number.isFinite)) return null;
  return start >= paper.x && end <= paper.x + paper.width + 1e-8;
}
