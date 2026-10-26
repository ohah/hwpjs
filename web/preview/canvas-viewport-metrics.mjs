// Logical view geometry is separate from CSS size and raster backing resolution.
export function canvasViewportMetrics(viewport, scale = 1, devicePixelRatio = 1) {
  const width = viewport.clientWidth,
    height = viewport.clientHeight,
    scrollTop = viewport.scrollTop;
  const scrollLeft = viewport.scrollLeft ?? 0;
  if (
    ![width, height, scrollTop, scrollLeft].every(
      (value) => Number.isFinite(value) && value >= 0,
    ) ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isFinite(devicePixelRatio) ||
    devicePixelRatio <= 0
  )
    return null;
  const ratio = Math.min(devicePixelRatio, 3);
  const pixelWidth = Math.ceil(width * ratio),
    pixelHeight = Math.ceil(height * ratio);
  const logicalWidth = width / scale,
    logicalHeight = height / scale,
    logicalScrollTop = scrollTop / scale;
  const logicalScrollLeft = scrollLeft / scale;
  if (
    ![pixelWidth, pixelHeight].every(Number.isSafeInteger) ||
    ![logicalWidth, logicalHeight, logicalScrollTop, logicalScrollLeft].every(Number.isFinite)
  )
    return null;
  return {
    width,
    height,
    scrollTop,
    scrollLeft,
    scale,
    ratio,
    pixelWidth,
    pixelHeight,
    logicalWidth,
    logicalHeight,
    logicalScrollTop,
    logicalScrollLeft,
  };
}
