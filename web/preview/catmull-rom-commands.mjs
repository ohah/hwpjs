/** Uniform Catmull-Rom anchors expressed as cubic Canvas commands. */
export function catmullRomCommands(points, { closed = false, maxSegments = 65536 } = {}) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    typeof closed !== "boolean" ||
    !Number.isSafeInteger(maxSegments) ||
    maxSegments < 1 ||
    maxSegments > 65536 ||
    !Array.isArray(points) ||
    points.length < (closed ? 3 : 2)
  )
    return fail("InvalidSplineAnchors");
  const count = closed ? points.length : points.length - 1;
  if (count > maxSegments) return fail("CurveSplineSegmentLimit");
  for (const point of points) {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1])
    )
      return fail("InvalidSplineAnchors");
  }
  const anchor = (index) =>
    points[
      closed
        ? (index + points.length) % points.length
        : Math.max(0, Math.min(points.length - 1, index))
    ];
  const commands = [{ kind: "moveTo", x: points[0][0], y: points[0][1] }];
  for (let i = 0; i < count; i++) {
    const before = anchor(i - 1),
      from = anchor(i),
      to = anchor(i + 1),
      after = anchor(i + 2);
    const cp1 = from.map((v, axis) => v + (to[axis] - before[axis]) / 6);
    const cp2 = to.map((v, axis) => v - (after[axis] - from[axis]) / 6);
    if (![...cp1, ...cp2].every(Number.isFinite)) return fail("InvalidSplineControlPoint");
    commands.push({
      kind: "bezierCurveTo",
      cp1x: cp1[0],
      cp1y: cp1[1],
      cp2x: cp2[0],
      cp2y: cp2[1],
      x: to[0],
      y: to[1],
    });
  }
  if (closed) commands.push({ kind: "closePath" });
  return { state: "ready", interpretation: "catmull-rom", closed, commands };
}
