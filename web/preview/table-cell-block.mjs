// Canvas cell blocks use display identities, separate from table edit leases.
export function tableCellBlockContext(content, point, paragraph) {
  if (
    !['hwp5', 'hwpx'].includes(content?.format) ||
    content.limited ||
    content.window ||
    content.viewKind ||
    !point ||
    !paragraph ||
    paragraph.clipped ||
    (!paragraph.selectable && !paragraph.editable)
  )
    return null;
  const created = point.createdCell;
  const binding = paragraph.tableCell;
  if (
    paragraph.section !== point.section ||
    (created
      ? paragraph.createdCell?.identity !== created.identity ||
        paragraph.createdCell?.row !== created.row ||
        paragraph.createdCell?.column !== created.column
      : !binding || paragraph.paragraph !== point.paragraph)
  )
    return null;
  const tables = created ? content.createdTables : content.tables;
  const matches = tables?.filter(
    (table) =>
      table.section === point.section &&
      (created ? table.identity === created.identity : table.tableNode === binding.tableNode),
  );
  if (matches?.length !== 1 || matches[0].partial) return null;
  const [table] = matches;
  const cells = table.cells.filter((cell) =>
    created
      ? cell.row === created.row && cell.column === created.column
      : cell.listNode === binding.listNode && cell.paragraphs.includes(point.paragraph),
  );
  return cells.length === 1 ? { table, cell: cells[0], created: Boolean(created) } : null;
}

const bounds = (cell) => [
  cell.row,
  cell.column,
  cell.row + (cell.rowSpan ?? 1),
  cell.column + (cell.columnSpan ?? 1),
];

export function adjacentBlockCell(table, cell, key) {
  const [row, column, bottom, right] = bounds(cell);
  const destination = {
    ArrowUp: [row - 1, column],
    ArrowDown: [bottom, column],
    ArrowLeft: [row, column - 1],
    ArrowRight: [row, right],
  }[key];
  if (!destination) return null;
  const [y, x] = destination;
  return (
    table.cells.find((next) => {
      const [top, left, endRow, endColumn] = bounds(next);
      return y >= top && y < endRow && x >= left && x < endColumn;
    }) ?? null
  );
}

const cellKey = (cell, created) => (created ? `${cell.row}:${cell.column}` : cell.listNode);

export function tableCellBlockPaint({ table, created, start, cell, stage }) {
  let selected;
  if (stage === 'table') selected = table.cells;
  else if (stage === 'cell') selected = [cell];
  else {
    const a = bounds(start),
      b = bounds(cell);
    let top = Math.min(a[0], b[0]),
      left = Math.min(a[1], b[1]),
      bottom = Math.max(a[2], b[2]),
      right = Math.max(a[3], b[3]);
    selected = [];
    const included = new Set();
    // Include a merged cell as a unit and close the rectangle over its span.
    let expanded;
    do {
      expanded = false;
      for (const candidate of table.cells) {
        if (included.has(candidate)) continue;
        const [r, c, endRow, endColumn] = bounds(candidate);
        if (r >= bottom || c >= right || endRow <= top || endColumn <= left) continue;
        included.add(candidate);
        selected.push(candidate);
        if (r < top || c < left || endRow > bottom || endColumn > right) {
          top = Math.min(top, r);
          left = Math.min(left, c);
          bottom = Math.max(bottom, endRow);
          right = Math.max(right, endColumn);
          expanded = true;
        }
      }
    } while (expanded);
  }
  return {
    section: table.section,
    tableNode: table.tableNode,
    identity: created ? table.identity : undefined,
    cells: new Set(selected.map((value) => cellKey(value, created))),
  };
}

export function tableCellBlockContainsBox(block, box) {
  if (!block || block.section !== box.section || box.previewOnly) return false;
  if (block.identity !== undefined)
    return (
      box.createdCell?.identity === block.identity &&
      block.cells.has(cellKey(box.createdCell, true))
    );
  return !box.createdCell && block.tableNode === box.tableNode && block.cells.has(box.listNode);
}
