import { affinePoint, hwpRenderingMatrix } from "./affine-point-geometry.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

// A transformed ellipse is a center plus two radius vectors, not a rectangle.
export function ellipseRenderingGeometry(row) {
  const fail = error => ({ state: "unavailable", error });
  const local = row?.geometry, rendering = row?.common?.rendering;
  if (local?.has_arc_properties !== "0" || local.arc_type !== "NORMAL") return fail("UnsupportedEllipseArcProfile");
  if (!rendering || rendering.matrix_error !== null || !Array.isArray(rendering.matrix) || rendering.matrix.length !== 6
    || !Array.from(rendering.matrix).every(Number.isFinite) || rendering.angle !== 0 || rendering.reverse !== null
    || !Array.isArray(rendering.flip) || rendering.flip.length !== 2 || !Array.from(rendering.flip).every(value => value === false)) return fail("UnsupportedEllipseRendering");
  const points = local.points?.slice(0, 3);
  if (points?.length !== 3 || !Array.from(points).every(p => p && [p.x, p.y].every(Number.isFinite))) return fail("MissingEllipseAxes");
  // HWP matrix row order -> shared Canvas affine order, without reinterpreting offsets.
  const matrix = hwpRenderingMatrix(rendering.matrix);
  const mapped = points.map(p => affinePoint(matrix, [p.x, p.y]));
  if (mapped.some(p => !p)) return fail("InvalidEllipseRendering");
  const [center, axis1, axis2] = mapped.map(p => p.map(hwpUnitPixels));
  const u = [axis2[0] - center[0], axis2[1] - center[1]], v = [center[0] - axis1[0], center[1] - axis1[1]];
  const determinant = u[0] * v[1] - u[1] * v[0];
  const rx = Math.hypot(u[0], v[0]), ry = Math.hypot(u[1], v[1]);
  const bounds = { x: center[0] - rx, y: center[1] - ry, width: 2 * rx, height: 2 * ry };
  if (![...center, ...u, ...v, determinant, ...Object.values(bounds)].every(Number.isFinite) || determinant === 0 || rx <= 0 || ry <= 0) return fail("DegenerateEllipseAxes");
  return { state: "resolved", center, u, v, bounds };
}
