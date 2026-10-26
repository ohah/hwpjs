/** Place a measured caption relative to an explicit table rectangle. */
export function positionTableCaption(rectangle, measured, { side, gap, verticalAlignment } = {}) {
  const fail = () => ({ state: 'unavailable', error: 'InvalidTableCaptionPosition' });
  if (
    !rectangle ||
    ![rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(Number.isFinite) ||
    rectangle.width <= 0 ||
    rectangle.height < 0 ||
    measured?.state !== 'measured' ||
    ![measured.width, measured.height].every(Number.isFinite) ||
    measured.width <= 0 ||
    measured.height < 0 ||
    !Array.isArray(measured.rows) ||
    ![0, 1, 2, 3].includes(side) ||
    !Number.isFinite(gap)
  )
    return fail();
  let x = rectangle.x,
    y = rectangle.y;
  if (side === 2) y -= measured.height + gap;
  else if (side === 3) y += rectangle.height + gap;
  else {
    if (![0, 1, 2].includes(verticalAlignment)) return fail();
    x = side === 0 ? rectangle.x - measured.width - gap : rectangle.x + rectangle.width + gap;
    y += (Math.max(0, rectangle.height - measured.height) * verticalAlignment) / 2;
  }
  const right = x + measured.width,
    bottom = y + measured.height;
  const tableRight = rectangle.x + rectangle.width,
    tableBottom = rectangle.y + rectangle.height;
  if (![x, y, right, bottom, tableRight, tableBottom].every(Number.isFinite)) return fail();
  const rows = [];
  for (const row of measured.rows) {
    const rowX = x + (row.paragraphX ?? 0),
      rowY = y + row.y;
    if (![rowX, rowY, rowY + row.height].every(Number.isFinite)) return fail();
    rows.push({ ...row, x, y: rowY });
  }
  const left = Math.min(x, rectangle.x),
    top = Math.min(y, rectangle.y);
  const width = Math.max(right, tableRight) - left,
    height = Math.max(bottom, tableBottom) - top;
  if (![width, height].every(Number.isFinite)) return fail();
  return {
    state: 'positioned',
    captionRectangle: { x, y, width: measured.width, height: measured.height },
    bounds: { x: left, y: top, width, height },
    rows,
  };
}
