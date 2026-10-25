// Callers validate source policy/bounds. Shared paragraph offset arithmetic.
export function paragraphTableStart(anchorY, occupiedBottom, pageTop, offset) {
  const requestedY = anchorY + offset;
  const y = Math.max(pageTop, occupiedBottom, requestedY);
  return { requestedY, y, gap: y - occupiedBottom };
}
