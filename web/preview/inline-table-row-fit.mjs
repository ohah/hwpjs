import { paragraphLineGeometry } from './paragraph-geometry.mjs';

function inlineTablePaperBounds(row, context) {
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
  return { start, end, width, fits: start >= paper.x && end <= paper.x + paper.width + 1e-8 };
}

/** Original inline width may exceed a column, but cannot exceed physical paper. */
export function inlineTableRowFitsPaper(row, context) {
  if (row.inlineTableFit === undefined) return true;
  return inlineTablePaperBounds(row, context)?.fits ?? null;
}

/** Opt in only for immutable table bands and page-invariant horizontal geometry. */
export function createInlineTableFitRejection(source, { columns, paper } = {}) {
  const fit = source?.inlineTableFit;
  if (!fit || source.paragraphSource || !Array.isArray(columns) || columns.length === 0 || !paper)
    return null;
  const width = fit.width;
  const fields = ['left', 'right', 'indent', 'alignment'];
  const shape = fields.map((field) => fit.paragraphShape?.[field]);
  let disabled = false;
  const rejected = new Set();
  return (row, context, fits) => {
    if (fits) disabled = true;
    if (disabled) return null;
    const ordinal = context?.columnOrdinal;
    const column = columns[ordinal];
    if (
      !Number.isSafeInteger(ordinal) ||
      ordinal < 0 ||
      !column ||
      context.columnCount !== columns.length ||
      context.paper?.x !== paper.x ||
      context.paper?.width !== paper.width ||
      context.column?.x !== column.x ||
      context.column?.width !== column.width ||
      row.inlineTableFit?.width !== width ||
      fields.some(
        (field, index) => !Object.is(row.inlineTableFit?.paragraphShape?.[field], shape[index]),
      )
    ) {
      disabled = true;
      return null;
    }
    const bounds = inlineTablePaperBounds(row, context);
    if (!bounds || bounds.fits) {
      disabled = true;
      return null;
    }
    rejected.add(ordinal);
    if (rejected.size !== columns.length) return null;
    return {
      error: 'InlineTablePaperOverflow',
      tableIndex: source.tableIndex,
      tableNode: source.tableNode,
      bandOrdinal: source.bandOrdinal,
      width,
      paperWidth: paper.width,
      alignedStart: bounds.start - paper.x,
      alignedEnd: bounds.end - paper.x,
      overflowLeft: Math.max(0, paper.x - bounds.start),
      overflowRight: Math.max(0, bounds.end - paper.x - paper.width),
      rejectedColumns: rejected.size,
    };
  };
}
