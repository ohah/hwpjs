// Source ranges are indexed by their paragraph and cell owner, not paint order.
export function pictureAnchorRows(rows, cell) {
  if (!Array.isArray(rows)) return null;
  const index = new Map();
  for (const row of rows) {
    if (!row) return null;
    if (row.kind !== 'text' || row.startUnit === row.endUnit) continue;
    if (
      ![row.startUnit, row.endUnit].every((v) => Number.isSafeInteger(v) && v >= 0) ||
      row.endUnit <= row.startUnit
    )
      return null;
    const key = `${row.section}:${row.paragraph}:${row.tableNode ?? cell?.tableNode}:${row.listNode ?? cell?.listNode}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  for (const group of index.values()) {
    group.sort((a, b) => a.startUnit - b.startUnit);
    if (group.some((row, i) => i > 0 && row.startUnit < group[i - 1].endUnit)) return null;
  }
  return index;
}
export function pictureAnchorRow(index, picture) {
  const group =
    index.get(
      `${picture.section}:${picture.paragraph}:${picture.cell?.tableNode}:${picture.cell?.listNode}`,
    ) ?? [];
  let lo = 0,
    hi = group.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (group[mid].startUnit <= picture.anchorUnit) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 || picture.anchorUnit >= group[lo - 1].endUnit ? null : group[lo - 1];
}
