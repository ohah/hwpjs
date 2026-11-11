import { measureNestedTable } from './nested-table-measurement.mjs';
import { sourceTableCellHeightPlanForFormat } from './source-table-cell-height-format.mjs';

/** Reuse source padding, paragraph flow, terminal-line and object measurement. */
export function measureSourceTableCellHeights(content, table, rectangle, measure, project) {
  if (table.cells.some((cell) => cell.rowSpan !== 1 || cell.columnSpan !== 1))
    throw Error('UnsupportedSourceTableCellHeightSpans');
  const neutral = {
    ...table,
    cells: table.cells.map((cell) => ({ ...cell, height: 0, sourceVerticalAlignment: 0 })),
  };
  const withTable = (next) => ({
    ...content,
    tables: content.tables.map((value) => (value === table ? next : value)),
  });
  const measured = measureNestedTable(withTable(neutral), neutral, measure);
  if (measured.state !== 'measured') throw Error(measured.error);
  const selectedLists = new Set(
    table.cells
      .filter((cell) => cell.row >= rectangle.top && cell.row < rectangle.bottom)
      .map((cell) => cell.listNode),
  );
  const minimums = measured.grid.cells
    .filter((cell) => selectedLists.has(cell.listNode))
    .map((cell) => ({ listNode: cell.listNode, height: Math.ceil(cell.height * 75 - 1e-7) }));
  const request = { ...rectangle, minimums };
  const changes = sourceTableCellHeightPlanForFormat(content.format, table, request);
  const byList = new Map(changes.map((cell) => [cell.listNode, cell.height]));
  const resized = {
    ...table,
    cells: table.cells.map((cell) =>
      byList.has(cell.listNode) ? { ...cell, height: byList.get(cell.listNode) } : cell,
    ),
  };
  const candidate = project(withTable(resized));
  if (candidate.state !== 'paginated' || candidate.limited)
    throw Error('SourceTableCellHeightLayoutUnavailable');
  // Index each projected box once; duplicates remain an invalid sentinel.
  if (!Array.isArray(candidate.boxes)) throw Error('SourceTableCellHeightLayoutOverflow');
  const boxes = new Map();
  for (const box of candidate.boxes) {
    if (!box || typeof box !== 'object') throw Error('SourceTableCellHeightLayoutOverflow');
    if (box.section !== table.section || box.tableNode !== table.tableNode || box.previewOnly)
      continue;
    boxes.set(box.listNode, boxes.has(box.listNode) ? null : box);
  }
  const cellsByList = new Map(resized.cells.map((cell) => [cell.listNode, cell]));
  for (const minimum of minimums) {
    const box = boxes.get(minimum.listNode);
    const cell = cellsByList.get(minimum.listNode);
    if (
      !box ||
      !cell ||
      !Number.isFinite(box.height) ||
      box.height < 0 ||
      Math.abs(box.height - cell.height / 75) > 1e-6
    )
      throw Error('SourceTableCellHeightLayoutOverflow');
  }
  return minimums;
}
