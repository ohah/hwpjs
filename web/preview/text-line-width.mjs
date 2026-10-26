// A glyph's occupied width and the next glyph's origin are different when
// character spacing is active. The terminal boundary excludes trailing space.
export function createTextLineWidth(boundaries, initialWidth = 0) {
  if (
    !Array.isArray(boundaries) ||
    !boundaries.length ||
    !Number.isFinite(initialWidth) ||
    initialWidth < 0
  )
    throw new RangeError('InvalidTextMeasurement');
  let nextX = initialWidth,
    width = initialWidth;
  const values = (measured) => {
    const glyphWidth = typeof measured === 'number' ? measured : measured?.width;
    const advance = measured?.advance === undefined ? glyphWidth : measured.advance;
    if (
      ![glyphWidth, advance].every((value) => Number.isFinite(value) && value >= 0) ||
      !Number.isFinite(nextX + glyphWidth) ||
      !Number.isFinite(nextX + advance)
    )
      throw new RangeError('InvalidTextMeasurement');
    return { glyphWidth, advance };
  };
  return {
    nextX: () => nextX,
    width: () => width,
    probe(measured) {
      return Math.max(width, nextX + values(measured).glyphWidth);
    },
    add(measured, endUnit) {
      const { glyphWidth, advance } = values(measured);
      boundaries.at(-1).x = nextX;
      boundaries.push({
        unit: endUnit,
        x: nextX + glyphWidth,
        ...(advance !== glyphWidth ? { glyphWidth } : {}),
      });
      width = Math.max(width, nextX + glyphWidth);
      nextX += advance;
    },
    hardBreak(endUnit) {
      boundaries.push({ unit: endUnit, x: boundaries.at(-1).x });
    },
  };
}

export function boundaryGlyphWidth(start, end) {
  if (!start || !end || !Number.isFinite(start.x) || !Number.isFinite(end.x) || end.x < start.x)
    return null;
  const width = Object.hasOwn(end, 'glyphWidth') ? end.glyphWidth : end.x - start.x;
  return Number.isFinite(width) && width >= 0 && Number.isFinite(start.x + width) ? width : null;
}

export function textBoundaryExtent(boundaries) {
  if (!Array.isArray(boundaries) || !boundaries.length) return null;
  let left = Infinity,
    right = -Infinity;
  for (const point of boundaries) {
    if (!point || !Number.isFinite(point.x)) return null;
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
  }
  for (let i = 1; i < boundaries.length; i++) {
    const width = boundaryGlyphWidth(boundaries[i - 1], boundaries[i]);
    if (width === null) return null;
    right = Math.max(right, boundaries[i - 1].x + width);
  }
  return { left, right };
}
