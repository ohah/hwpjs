// Select the physical fragment owning one top/bottom caption. Source data stays intact.
export function supportsSplitTableCaption(table) {
  return [2, 3].includes(table?.sourceCaption?.side);
}

export function tableCaptionFragment(table, boxes) {
  const fail = error => ({ state: "unavailable", error });
  if (!boxes.length) return fail("UnsupportedSplitTableCaption");
  const groups = new Map();
  for (const box of boxes) {
    if (!Number.isSafeInteger(box.pageOrdinal) || box.pageOrdinal < 0
      || !Number.isSafeInteger(box.columnOrdinal ?? 0) || (box.columnOrdinal ?? 0) < 0
      || ![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite)
      || box.width <= 0 || box.height < 0) return fail("InvalidTableCaptionPageProjection");
    const key = `${box.pageOrdinal}:${box.columnOrdinal ?? 0}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(box);
  }
  const ordered = [...groups.values()].sort((a, b) => a[0].pageOrdinal - b[0].pageOrdinal
    || (a[0].columnOrdinal ?? 0) - (b[0].columnOrdinal ?? 0));
  const split = ordered.length > 1, side = table.sourceCaption?.side;
  if (split && !supportsSplitTableCaption(table)) return fail("UnsupportedSplitTableCaption");
  const selected = split && side === 3 ? ordered.at(-1) : ordered[0];
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const box of selected) {
    x = Math.min(x, box.x); y = Math.min(y, box.y);
    right = Math.max(right, box.x + box.width); bottom = Math.max(bottom, box.y + box.height);
  }
  return { state: "selected", boxes: selected, split, rectangle: { x, y, width: right - x, height: bottom - y } };
}
