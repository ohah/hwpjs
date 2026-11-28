export function parseTableMergeRange(range: unknown, rows: number, columns: number) {
  const match =
    typeof range === 'string' &&
    /^(0|[1-9]\d*),(0|[1-9]\d*):(0|[1-9]\d*),(0|[1-9]\d*)$/u.exec(range);
  if (!match || match[0] !== range) throw new TypeError('InvalidTableMergeRange');
  const [row, firstColumn, lastRow, lastColumn] = match.slice(1).map(Number);
  if (
    row > lastRow ||
    lastRow >= rows ||
    firstColumn > lastColumn ||
    lastColumn >= columns ||
    (row === lastRow && firstColumn === lastColumn)
  )
    throw new RangeError('InvalidTableMergeRange');
  return { row, firstColumn, lastRow, lastColumn };
}
