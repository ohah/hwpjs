function shifted(value, offset) {
  if (!Number.isFinite(value) || !Number.isFinite(offset) || !Number.isFinite(value + offset)) throw new Error("InvalidSectionLayoutOffset");
  return value + offset;
}

function shiftedOrdinal(value, offset) {
  if (![value, offset, value + offset].every(v => Number.isSafeInteger(v) && v >= 0)) throw new Error("InvalidSectionPageOrdinal");
  return value + offset;
}

export function moveSectionBox(box, offset) {
  return box == null ? box : { ...box, y: shifted(box.y, offset) };
}

/** Affine rows retain local coordinates; only their world translation moves. */
export function moveSectionRow(row, offset, ordinal) {
  const result = { ...row };
  if (!Number.isFinite(offset)) throw new Error("InvalidSectionLayoutOffset");
  if (row.pageOrdinal !== undefined) result.pageOrdinal = shiftedOrdinal(row.pageOrdinal, ordinal);
  if (row.transform !== undefined) {
    if (!Array.isArray(row.transform) || row.transform.length !== 6 || !row.transform.every(Number.isFinite)) throw new Error("InvalidSectionLayoutTransform");
    result.transform = [...row.transform];
    result.transform[5] = shifted(result.transform[5], offset);
    if (!Number.isFinite(result.transform[5])) throw new Error("InvalidSectionLayoutTransform");
  } else result.y = shifted(row.y, offset);
  if (row.referenceBoxes) result.referenceBoxes = Object.fromEntries(Object.entries(row.referenceBoxes).map(([key, box]) => [key, moveSectionBox(box, offset)]));
  return result;
}

export function moveSectionPlacement(item, offset, ordinal) {
  const result = { ...item };
  if (!Number.isFinite(offset)) throw new Error("InvalidSectionLayoutOffset");
  if (item.pageOrdinal !== undefined) result.pageOrdinal = shiftedOrdinal(item.pageOrdinal, ordinal);
  if (item.y !== undefined) result.y = shifted(item.y, offset);
  for (const key of ["rectangle", "origin", "captionRectangle", "bounds"]) if (item[key]) result[key] = moveSectionBox(item[key], offset);
  if (item.referenceBoxes) result.referenceBoxes = Object.fromEntries(Object.entries(item.referenceBoxes).map(([key, box]) => [key, moveSectionBox(box, offset)]));
  return result;
}
