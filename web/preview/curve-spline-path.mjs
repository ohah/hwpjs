import { curveSamplePath } from "./curve-sample-path.mjs";
import { catmullRomCommands } from "./catmull-rom-commands.mjs";

// Reuse source validation; the spline profile requires one continuous all-CURVE chain.
export function curveSplinePath(source, maxSegments = 65536) {
  const sample = curveSamplePath(source, maxSegments);
  if (sample.state !== "ready") return sample;
  const fail = error => ({ state: "unavailable", error });
  if (source.segments.some(s => s.kind !== "CURVE")) return fail("UnsupportedMixedCurveSpline");
  const first = source.segments[0], points = [[first.x1, first.y1]];
  for (const segment of source.segments) {
    const previous = points.at(-1);
    if (previous[0] !== segment.x1 || previous[1] !== segment.y1) return fail("DiscontinuousCurveSpline");
    points.push([segment.x2, segment.y2]);
  }
  const last = points.at(-1), closed = points[0][0] === last[0] && points[0][1] === last[1];
  if (closed) points.pop();
  const path = catmullRomCommands(points, { closed, maxSegments });
  return path.state === "ready" ? { ...path, node: source.node, segmentKinds: sample.segmentKinds } : path;
}
