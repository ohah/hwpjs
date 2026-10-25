const unavailable = reason => ({ state: "unavailable", reason });
const coordinate = point => ({ x: point.x, y: point.y });

export function validChartCurvePaths(paths) {
  if (!Array.isArray(paths)) return false;
  // Iteration visits sparse slots too; Array.every would silently accept them.
  for (const path of paths) {
    if (!Array.isArray(path)) return false;
    for (const segment of path) {
      if (!segment || !["start", "control1", "control2", "end"].every(key =>
        segment[key] && [segment[key].x, segment[key].y].every(Number.isFinite))) return false;
    }
  }
  return true;
}

/** Uniform Catmull-Rom, endpoint tangents from duplicated run endpoints. */
export function chartCurvePaths(points) {
  if (!Array.isArray(points)) return unavailable("InvalidChartCurveInput");
  for (const point of points) if (!point || ![point.x, point.y].every(Number.isFinite) ||
    point.break_before !== undefined && typeof point.break_before !== "boolean") return unavailable("InvalidChartCurvePoint");
  const paths = []; let runStart = 0;
  for (let i = 0; i < points.length; i++) {
    if (i === 0 || points[i].break_before) { runStart = i; paths.push([]); continue; }
    const first = points[i - 1], last = points[i];
    const previous = i - 2 >= runStart ? points[i - 2] : first;
    const next = i + 1 < points.length && !points[i + 1].break_before ? points[i + 1] : last;
    const control1 = {}, control2 = {};
    for (const axis of ["x", "y"]) {
      // Divide before subtraction to avoid an unnecessary finite-input overflow.
      control1[axis] = first[axis] + (last[axis] / 6 - previous[axis] / 6);
      control2[axis] = last[axis] - (next[axis] / 6 - first[axis] / 6);
    }
    if (![control1.x, control1.y, control2.x, control2.y].every(Number.isFinite)) return unavailable("UnrepresentableChartCurveControl");
    paths.at(-1).push({ from_position: i - 1, to_position: i, start: coordinate(first), control1, control2, end: coordinate(last) });
  }
  return { state: "ready", paths };
}
