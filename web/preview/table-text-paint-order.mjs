function paintRank(layer) {
  if (layer !== undefined && layer !== "behind" && layer !== "front") throw new RangeError("InvalidTablePaintLayer");
  return layer === "behind" ? 0 : layer === "front" ? 2 : 1;
}

export function tableTextPaintOrder(rows, first = 0) {
  const groups = [[], [], []];
  for (let index = first; index < rows.length; index++) {
    const layer = rows[index].tablePaintLayer;
    groups[paintRank(layer)].push(index);
  }
  return groups.flat();
}

export function topTablePaintRowIndex(rows, matches) {
  let found = -1, rank = -1;
  for (let index = rows.length - 1; index >= 0; index--) {
    const layer = rows[index].tablePaintLayer;
    const current = paintRank(layer);
    if (current <= rank || !matches(rows[index], index)) continue;
    found = index; rank = current;
    if (rank === 2) break;
  }
  return found;
}
