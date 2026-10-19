export function moveSectionBox(box, offset) {
  return box ? { ...box, y: box.y + offset } : box;
}

/** Affine rows retain local coordinates; only their world translation moves. */
export function moveSectionRow(row, offset, ordinal) {
  const result = { ...row };
  if (row.pageOrdinal !== undefined) result.pageOrdinal = ordinal + row.pageOrdinal;
  if (row.transform !== undefined) {
    if (!Array.isArray(row.transform) || row.transform.length !== 6 || !row.transform.every(Number.isFinite)) throw new Error("InvalidSectionLayoutTransform");
    result.transform = [...row.transform];
    result.transform[5] += offset;
    if (!Number.isFinite(result.transform[5])) throw new Error("InvalidSectionLayoutTransform");
  } else result.y = row.y + offset;
  if (row.referenceBoxes) result.referenceBoxes = Object.fromEntries(Object.entries(row.referenceBoxes).map(([key, box]) => [key, moveSectionBox(box, offset)]));
  return result;
}

export function moveSectionPlacement(item, offset, ordinal) {
  const result = { ...item };
  if (item.pageOrdinal !== undefined) result.pageOrdinal = ordinal + item.pageOrdinal;
  if (item.y !== undefined) result.y = item.y + offset;
  for (const key of ["rectangle", "origin", "captionRectangle", "bounds"]) if (item[key]) result[key] = moveSectionBox(item[key], offset);
  return result;
}
