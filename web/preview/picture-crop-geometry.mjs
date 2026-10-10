/** Convert explicit source-coordinate references; never infer them from clip ends. */
export function pictureCropRect(clip, pixelWidth, pixelHeight, { referenceWidth = null, referenceHeight = null, unitsPerPixel = null } = {}) {
  const positive = value => Number.isFinite(value) && value > 0;
  if (!Number.isSafeInteger(pixelWidth) || !Number.isSafeInteger(pixelHeight) || pixelWidth < 1 || pixelHeight < 1 || !Array.isArray(clip) || clip.length !== 4 || !clip.every(Number.isFinite)) throw new Error("InvalidPictureCropGeometry");
  let scaleX, scaleY, basis;
  if (referenceWidth !== null || referenceHeight !== null) {
    if (!positive(referenceWidth) || !positive(referenceHeight)) throw new Error("InvalidPictureCropReference");
    scaleX = referenceWidth / pixelWidth; scaleY = referenceHeight / pixelHeight; basis = "explicit_reference";
  } else if (unitsPerPixel !== null) {
    if (!positive(unitsPerPixel)) throw new Error("InvalidPictureCropReference");
    scaleX = scaleY = unitsPerPixel; basis = "declared_units";
  } else return { state: "missing_reference", rectangle: null, basis: null };
  if (!positive(scaleX) || !positive(scaleY)) throw new Error("InvalidPictureCropReference");
  const [left, right, top, bottom] = clip;
  if (right <= left || bottom <= top) return { state: "empty", rectangle: null, basis };
  const x = left / scaleX, y = top / scaleY, width = (right - left) / scaleX, height = (bottom - top) / scaleY;
  if (![x, y, width, height].every(Number.isFinite)) throw new Error("InvalidPictureCropGeometry");
  return { state: "mapped", rectangle: { x, y, width, height }, basis, outsideSource: x < 0 || y < 0 || x + width > pixelWidth || y + height > pixelHeight };
}
