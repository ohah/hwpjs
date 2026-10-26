/** Physical object footprint and body intersection are distinct rectangles. */
export function tableBodyIntersection(footprint, body) {
  const valid = (box) =>
    box &&
    [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(
      Number.isFinite,
    ) &&
    box.width > 0 &&
    box.height > 0;
  if (!valid(footprint) || !valid(body))
    return { state: 'unavailable', error: 'InvalidTableBodyIntersection' };
  const x = Math.max(footprint.x, body.x),
    y = Math.max(footprint.y, body.y);
  const right = Math.min(footprint.x + footprint.width, body.x + body.width);
  const bottom = Math.min(footprint.y + footprint.height, body.y + body.height);
  if (right <= x || bottom <= y) return { state: 'disjoint', intersection: null };
  return { state: 'intersecting', intersection: { x, y, width: right - x, height: bottom - y } };
}
