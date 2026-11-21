function paintRank(layer) {
  if (layer !== undefined && layer !== 'behind' && layer !== 'front')
    throw new RangeError('InvalidTablePaintLayer');
  return layer === 'behind' ? 0 : layer === 'front' ? 2 : 1;
}

export function tableTextPaintOrder(rows, first = 0) {
  const indices = [];
  for (let index = first; index < rows.length; index++) {
    paintKey(rows[index]);
    indices.push(index);
  }
  return indices.toSorted((a, b) => comparePaint(rows[a], rows[b]));
}

export function topTablePaintRowIndex(rows, matches) {
  let found = -1;
  for (let index = rows.length - 1; index >= 0; index--) {
    paintKey(rows[index]);
    if (found >= 0 && comparePaint(rows[index], rows[found]) <= 0) continue;
    if (matches(rows[index], index)) found = index;
  }
  return found;
}

function paintKey(item) {
  paintRank(item.tablePaintLayer);
  if (
    item.drawingPaintLayer !== undefined &&
    (item.drawingPaintLayer !== 'behind' ||
      (item.tablePaintLayer !== undefined && item.tablePaintLayer !== 'behind'))
  )
    throw new RangeError('InvalidDrawingTextPaintLayer');
  const tableZ = item.tablePaintZOrder === undefined ? 0 : item.tablePaintZOrder;
  if (!Number.isSafeInteger(tableZ) || tableZ < -2147483648 || tableZ > 4294967295)
    throw new RangeError('InvalidTablePaintOrder');
  if (item.drawingPaintLayer === undefined && item.drawingPaintZOrder !== undefined)
    throw new RangeError('InvalidDrawingTextPaintLayer');
  const rank = paintRank(item.drawingPaintLayer ?? item.tablePaintLayer),
    z = item.drawingPaintLayer === undefined ? tableZ : item.drawingPaintZOrder;
  if (!Number.isSafeInteger(z) || z < -2147483648 || z > 4294967295)
    throw new RangeError('InvalidTablePaintOrder');
  return [rank, rank === 1 ? 0 : z];
}
function comparePaint(a, b) {
  const x = paintKey(a),
    y = paintKey(b);
  return x[0] - y[0] || x[1] - y[1];
}

/** Borders and text share layer/order; front borders must not paint behind body text. */
export function tablePaintScene(boxes, rows, first = 0) {
  const commands = boxes.map((box, index) => ({ kind: 'box', item: box, index }));
  for (let index = first; index < rows.length; index++)
    commands.push({ kind: 'row', item: rows[index], index });
  for (const command of commands) paintKey(command.item);
  return commands.toSorted((a, b) => comparePaint(a.item, b.item));
}
