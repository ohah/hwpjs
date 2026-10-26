// Match Canvas' default nonzero winding rule, including the boundary.
export function pointInClosedPath(points, x, y) {
  if (
    !Array.isArray(points) ||
    points.length < 3 ||
    ![x, y].every(Number.isFinite) ||
    !Array.from(points).every(
      (p) => Array.isArray(p) && p.length === 2 && Array.from(p).every(Number.isFinite),
    )
  )
    return false;
  // Normalize before subtraction/cross products to avoid overflow for finite inputs.
  let scale = Math.max(1, Math.abs(x), Math.abs(y));
  for (const point of points) scale = Math.max(scale, Math.abs(point[0]), Math.abs(point[1]));
  x /= scale;
  y /= scale;
  let winding = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const ax = a[0] / scale,
      ay = a[1] / scale,
      bx = b[0] / scale,
      by = b[1] / scale;
    const cross = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
    if (
      cross === 0 &&
      x >= Math.min(ax, bx) &&
      x <= Math.max(ax, bx) &&
      y >= Math.min(ay, by) &&
      y <= Math.max(ay, by)
    )
      return true;
    if (ay <= y && by > y && cross > 0) winding++;
    else if (ay > y && by <= y && cross < 0) winding--;
  }
  return winding !== 0;
}
