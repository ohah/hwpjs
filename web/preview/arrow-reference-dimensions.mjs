// RHWP sizing policy, not certified Hangul layout dimensions.
const levels = ["SMALL", "MEDIUM", "LARGE"];
export function arrowReferenceDimensions(strokeWidth, lineLength, size) {
  if (
    !Number.isFinite(strokeWidth) ||
    strokeWidth <= 0 ||
    !Number.isFinite(lineLength) ||
    lineLength <= 0 ||
    typeof size !== "string"
  )
    return null;
  const parts = size.split("_");
  if (parts.length !== 2) return null;
  const width = levels.indexOf(parts[0]),
    length = levels.indexOf(parts[1]);
  if (width < 0 || length < 0) return null;
  const height = Math.max(strokeWidth * [1.5, 2.5, 3.5][width], 3);
  const extent = Math.min(height * [1, 1.5, 2][length], lineLength * 0.3);
  if (!Number.isFinite(height) || !Number.isFinite(extent) || extent <= 0) return null;
  return { length: extent, width: height, policy: "rhwp_reference" };
}
