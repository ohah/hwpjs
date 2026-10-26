import { validateHwp5DrawingPolygonPoints } from "../../js/hwp5-drawing-polygon-points.mjs";

// Path geometry only. Fill clipping closes implicitly; stroke preserves source closure.
export function hwp5PolygonPathSource(row) {
  try {
    validateHwp5DrawingPolygonPoints([row]);
  } catch (error) {
    return { state: "unavailable", error: error.message };
  }
  if (row.points.length < 2)
    return { state: "unavailable", error: "UnsupportedHwp5PolygonPointCount" };
  const first = row.raw_points[0],
    last = row.raw_points.at(-1);
  const strokeOnly = row.points.length === 2;
  if (
    strokeOnly &&
    ((first[0] === last[0] && first[1] === last[1]) ||
      (row.points[0][0] === row.points[1][0] && row.points[0][1] === row.points[1][1]))
  )
    return { state: "unavailable", error: "DegenerateHwp5PolygonSegment" };
  return {
    state: "planned",
    source: {
      rendering_polygon: row.points.map((point) => [...point]),
      polygon_closed: first[0] === last[0] && first[1] === last[1],
      polygon_tail: { extra_bytes: row.extra_bytes, interpreted: false },
    },
  };
}
