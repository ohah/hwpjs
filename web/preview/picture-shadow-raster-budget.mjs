// Two temporary RGBA surfaces; this bounds pixel storage, not browser overhead.
export function pictureShadowRasterSize(bounds, scale) {
  if (
    !bounds ||
    ![bounds.width, bounds.height, scale].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    !Number.isSafeInteger(scale) ||
    scale < 1 ||
    scale > 16
  )
    return null;
  const width = Math.ceil(bounds.width * scale),
    height = Math.ceil(bounds.height * scale);
  if (width > 8192 || height > 8192 || width * height * 8 > 64 * 1024 * 1024) return null;
  return { width, height };
}
