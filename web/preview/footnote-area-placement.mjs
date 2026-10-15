// 측정된 각주 영역을 한 단에 배치합니다. 참조의 페이지 이동은 페이지 엔진 책임입니다.
export function placeFootnoteArea(notes, policy, column, occupiedBottom, separatorHeight, maxRows = 20000) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Array.isArray(notes) || !notes.length || policy?.state !== "selected" || policy.kind !== "footnote"
    || !column || ![column.x, column.y, column.width, column.height, column.x + column.width, column.y + column.height, occupiedBottom, separatorHeight].every(Number.isFinite)
    || column.width <= 0 || column.height <= 0 || occupiedBottom < column.y || occupiedBottom > column.y + column.height || separatorHeight < 0
    || ![policy.aboveLine, policy.belowLine, policy.betweenNotes].every(value => Number.isFinite(value) && value >= 0)
    || !Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("InvalidFootnoteArea");
  if (notes.some(note => note?.kind !== "footnote" || note.section !== policy.section || !Array.isArray(note.rows)
    || !Number.isFinite(note.height) || note.height <= 0 || note.width !== column.width)) return unavailable("InvalidFootnoteArea");
  const height = policy.aboveLine + separatorHeight + policy.belowLine + notes.reduce((sum, note) => sum + note.height, 0) + policy.betweenNotes * (notes.length - 1);
  if (!Number.isFinite(height)) return unavailable("InvalidFootnoteArea");
  const top = policy.beneathText ? occupiedBottom : column.y + column.height - height;
  if (top < occupiedBottom || top + height > column.y + column.height) return unavailable("FootnoteAreaOverflow");
  const rows = [], boxes = [], numberPrefixes = [], owners = new Set();
  let cursor = top + policy.aboveLine + separatorHeight + policy.belowLine;
  for (const note of notes) {
    if (owners.has(note.noteNode)) return unavailable("AmbiguousFootnoteArea");
    owners.add(note.noteNode);
    for (const row of note.rows) {
      if (rows.length + numberPrefixes.length >= maxRows) return unavailable("FootnoteAreaLimit");
      if (!row || ![row.y, row.height, row.x ?? 0].every(Number.isFinite) || row.y < 0 || row.height <= 0 || row.y + row.height > note.height) return unavailable("InvalidFootnoteArea");
      const projected = { ...row, x: column.x + (row.x ?? 0), y: cursor + row.y,
        ...(row.pageClip ? { pageClip: { ...row.pageClip, x: column.x + row.pageClip.x, y: cursor + row.pageClip.y } } : {}) };
      if (![projected.x, projected.y, projected.y + row.height].every(Number.isFinite)) return unavailable("InvalidFootnoteArea");
      rows.push(projected);
    }
    for (const [key, output] of [["boxes", boxes], ["numberPrefixes", numberPrefixes]]) {
      if (note[key] !== undefined && !Array.isArray(note[key])) return unavailable("InvalidFootnoteArea");
      for (const item of note[key] ?? []) {
        if (key === "boxes" && boxes.length >= maxRows) return unavailable("FootnoteAreaLimit");
        if (rows.length + numberPrefixes.length >= maxRows && key === "numberPrefixes") return unavailable("FootnoteAreaLimit");
        if (!item || ![item.x, item.y, item.height, item.x + (item.width ?? 0), item.y + item.height].every(Number.isFinite)
            || item.y < 0 || item.height <= 0 || item.y + item.height > note.height
            || key === "boxes" && (!Number.isFinite(item.width) || item.width <= 0 || item.x < 0 || item.x + item.width > column.width + 1e-8)) return unavailable("InvalidFootnoteArea");
        output.push({ ...item, x: column.x + item.x, y: cursor + item.y });
      }
    }
    cursor += note.height + policy.betweenNotes;
  }
  return { state: "placed", rows, boxes, numberPrefixes, area: { x: column.x, y: top, width: column.width, height },
    separatorY: top + policy.aboveLine, bodyBottom: top, spatialRows: true };
}
