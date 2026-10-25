import { hwp5PolygonPathSource } from "./hwp5-polygon-path-source.mjs";
import { affinePoint } from "./affine-point-geometry.mjs";

// Native points and local matrices already use root-group coordinates.
// Size corners provide a placement box, never an invented filled polygon.
export function projectHwp5GroupPolygonGeometry(content, component, local) {
  const fail = error => ({ state: "unavailable", error });
  if (!component || !local || component.kind_id !== 0x24706f6c || component.second_id !== null
    || component.component_node !== local.component_node || component.owner_node !== local.owner_node) return fail("Hwp5GroupPolygonOwnerMismatch");
  if (content.hwp5PolygonPointErrors?.some(row => row.section === component.section)) return fail("IncompleteHwp5GroupPolygonPoints");
  const points = (content.hwp5PolygonPoints ?? []).filter(row => row.section === component.section && row.component_node === component.component_node);
  if (points.length !== 1) return fail("MissingHwp5GroupPolygonPoints");
  if (points[0].layout !== "observed_i32_points") return fail("UnsupportedHwp5GroupPolygonLayout");
  const path = hwp5PolygonPathSource(points[0]);
  if (path.state !== "planned") return path;
  const width = component.original_width, height = component.original_height, m = local.matrix;
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff)
    || !Array.isArray(m) || m.length !== 6 || !Array.from(m).every(Number.isFinite)) return fail("InvalidHwp5GroupPolygonBounds");
  const matrix = [m[0], m[3], m[1], m[4], m[2], m[5]];
  const corners = [[0, 0], [width, 0], [width, height], [0, height]].map(point => affinePoint(matrix, point));
  if (corners.some(point => point === null)) return fail("InvalidHwp5GroupPolygonBounds");
  return { state: "projected", source: { ...path.source, rendering_corners: corners, component: structuredClone(component) } };
}
