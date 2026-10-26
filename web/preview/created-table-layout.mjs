import { layoutContent } from './layout.mjs';
import { tableGrid, hwpUnitsToPixels } from './table-grid.mjs';
import { tableInsets } from './table-insets.mjs';

// Local display flow; identity addresses never become source node indices.
export function layoutCreatedTable(
  table,
  measure,
  { x = 20, y = 0, maxRows = 20000, compactLines, minimumRowHeight } = {},
) {
  if (typeof table?.identity !== 'string' || !Number.isInteger(table.section) || table.section < 0)
    throw new Error('InvalidCreatedTableLayout');
  if (!Number.isInteger(maxRows) || maxRows < 1) throw new Error('InvalidCreatedTableLayout');
  const native = ['hwp5', 'hwpx'].includes(table.displayFormat),
    insets = tableInsets(native ? table.displayInsets : 6),
    minimumRow = minimumRowHeight ?? (native ? 0 : 1),
    compact = compactLines ?? true;
  if (!insets || typeof compact !== 'boolean' || !Number.isFinite(minimumRow) || minimumRow < 0)
    throw new Error('InvalidCreatedTableLayout');
  const cells = table.cells.map((cell) => ({ ...cell, rowSpan: 1, columnSpan: 1 }));
  const columnWidths = cells.slice(0, table.columns).map((cell) => hwpUnitsToPixels(cell.width));
  tableGrid({ ...table, cells }, { x, y, columnWidths, minColumn: 1, minRow: 1 });
  const paragraphs = cells.map((cell) => ({
    section: table.section,
    createdCell: { identity: table.identity, row: cell.row, column: cell.column },
    ...(native
      ? { paraShapeId: table.resources.paragraph, paragraphShape: table.displayParagraphShape }
      : {}),
    ...(cell.currentReference ? { currentReference: cell.currentReference } : {}),
    ...(cell.softLineBreakAvailable === true ? { softLineBreakAvailable: true } : {}),
    text: cell.text,
    editable: true,
    selectable: true,
    label: '',
    characterRanges: [{ start: 0, end: cell.text.length, charShapeId: table.resources.character }],
  }));
  const flows = [];
  let count = 0;
  for (const [index, paragraph] of paragraphs.entries()) {
    if (count === maxRows) throw new Error('CreatedTableLayoutRowBudgetExceeded');
    const flow = layoutContent(
      { paragraphs: [paragraph], limited: false },
      Math.max(1, columnWidths[cells[index].column] - insets.left - insets.right),
      (text, _p, unit, kind) => measure(text, paragraph, unit, kind),
      maxRows - count,
      { compactLines: compact, documentBody: true, includeTerminalAfter: false },
    );
    const textRows = native ? flow.rows : flow.rows.filter((row) => row.kind === 'text');
    if (flow.limited || count + textRows.length > maxRows)
      throw new Error('CreatedTableLayoutRowBudgetExceeded');
    count += textRows.length;
    flows.push({ ...flow, rows: textRows });
  }
  const grid = tableGrid(
    { ...table, cells },
    {
      x,
      y,
      columnWidths,
      minColumn: 1,
      minRow: minimumRow,
      contentSize: (cell) => ({
        width: 0,
        height: flows[cell.row * table.columns + cell.column].height + insets.top + insets.bottom,
      }),
    },
  );
  const boxes = grid.cells.map(({ listNode: _unused, ...box }, index) => ({
    ...box,
    section: table.section,
    createdCell: paragraphs[index].createdCell,
  }));
  const rows = flows.flatMap((flow, index) =>
    flow.rows.map((row) => ({
      ...row,
      section: table.section,
      createdCell: paragraphs[index].createdCell,
      x: boxes[index].x + insets.left,
      y: boxes[index].y + insets.top + row.y,
      width: native ? row.width : Math.max(1, boxes[index].width - insets.left - insets.right),
      pageClip: {
        x: boxes[index].x,
        y: boxes[index].y,
        width: boxes[index].width,
        height: boxes[index].height,
      },
    })),
  );
  return {
    rows,
    boxes,
    paragraphs,
    width: grid.width,
    height: grid.height,
    limited: false,
    spatialRows: true,
    mode: 'created-table-local-flow',
  };
}
