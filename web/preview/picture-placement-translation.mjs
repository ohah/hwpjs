// Move an already measured picture frame without changing its source ownership.
export function translatePicturePlacement(picture, x, y, physical = {}) {
  const fail = () => ({ state: 'unavailable', error: 'InvalidPicturePlacementTranslation' });
  if (!picture || ![x, y].every(Number.isFinite) || !physical || typeof physical !== 'object')
    return fail();
  for (const key of ['pageOrdinal', 'columnOrdinal'])
    if (physical[key] !== undefined && (!Number.isSafeInteger(physical[key]) || physical[key] < 0))
      return fail();
  const target = Object.fromEntries(
    ['pageOrdinal', 'columnOrdinal', 'referenceBoxes']
      .filter((key) => physical[key] !== undefined)
      .map((key) => [key, physical[key]]),
  );
  const result = { ...picture, ...target };
  for (const key of ['rectangle', 'flowRectangle', 'captionRectangle']) {
    const r = picture[key];
    if (r === undefined && key !== 'rectangle') continue;
    if (
      !r ||
      ![
        r.x,
        r.y,
        r.width,
        r.height,
        r.x + r.width,
        r.y + r.height,
        r.x + x,
        r.y + y,
        r.x + x + r.width,
        r.y + y + r.height,
      ].every(Number.isFinite) ||
      r.width <= 0 ||
      r.height <= 0
    )
      return fail();
    result[key] = { ...r, x: r.x + x, y: r.y + y };
  }
  if (result.flowRectangle && result.captionRectangle) {
    const frame = result.flowRectangle;
    for (const r of [result.rectangle, result.captionRectangle])
      if (
        r.x < frame.x - 1e-8 ||
        r.y < frame.y - 1e-8 ||
        r.x + r.width > frame.x + frame.width + 1e-8 ||
        r.y + r.height > frame.y + frame.height + 1e-8
      )
        return fail();
  }
  if (picture.captionRows !== undefined) {
    if (
      !Array.isArray(picture.captionRows) ||
      picture.captionRows.length > 20000 ||
      !picture.captionRectangle ||
      !picture.flowRectangle
    )
      return fail();
    const rows = [];
    for (const row of picture.captionRows) {
      if (
        !row ||
        !['text', 'gap'].includes(row.kind) ||
        row.section !== picture.section ||
        row.pictureNode !== picture.pictureNode ||
        ![row.captionNode, row.listNode].every((n) => Number.isSafeInteger(n) && n >= 0) ||
        ![row.x, row.y, row.height, row.x + x, row.y + y, row.y + row.height + y].every(
          Number.isFinite,
        ) ||
        row.height <= 0 ||
        (row.width !== undefined &&
          (!Number.isFinite(row.width) || row.width < 0 || !Number.isFinite(row.x + x + row.width)))
      )
        return fail();
      rows.push({ ...row, ...target, x: row.x + x, y: row.y + y });
    }
    result.captionRows = rows;
  }
  return { state: 'translated', picture: result };
}
