import { affinePoint, hwpRenderingMatrix } from "./affine-point-geometry.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { curveSamplePath } from "./curve-sample-path.mjs";
import { curveSplinePath } from "./curve-spline-path.mjs";
import {
  curveCommandBounds as commandBounds,
  mapCurveCommands,
} from "./curve-command-geometry.mjs";

export function validCurveCommands(commands) {
  return commandBounds(commands) !== null;
}

// 월드 이동 후의 뺄셈 반올림만 허용합니다. 원본 기하 검사의 정확 비교는 유지합니다.
export function offsetPlacedCurveGeometry(geometry, offset) {
  const fail = () => ({ state: "unavailable", error: "InvalidCurvePageGeometry" });
  if (geometry?.state !== "placed") return fail();
  const measured = commandBounds(geometry.commands),
    bounds = geometry.bounds;
  if (!measured || !bounds || bounds.width < 0 || bounds.height < 0) return fail();
  const scale = Math.max(1, ...Object.values(measured).map(Math.abs));
  if (
    !["x", "y", "width", "height"].every(
      (key) =>
        Number.isFinite(bounds[key]) &&
        Math.abs(bounds[key] - measured[key]) <= 8 * Number.EPSILON * scale,
    )
  )
    return fail();
  const moved = translateCurveGeometry(
    { ...geometry, state: "resolved", bounds: measured },
    offset,
  );
  if (moved.state !== "placed") return moved;
  const movedBounds = commandBounds(moved.commands);
  return movedBounds ? { ...moved, bounds: movedBounds } : fail();
}

export function curveRenderingMatrix(source) {
  const r = source?.common?.rendering,
    matrix = hwpRenderingMatrix(r?.matrix);
  return matrix &&
    r.matrix_error === null &&
    r.angle === 0 &&
    r.reverse === null &&
    Array.isArray(r.flip) &&
    r.flip.length === 2 &&
    Array.from(r.flip).every((value) => value === false)
    ? matrix
    : null;
}

// Rendering matrices already target the root group frame; do not apply parent matrices again.
export function curveRenderingGeometry(source) {
  const fail = (error) => ({ state: "unavailable", error });
  const path =
    Array.isArray(source?.segments) &&
    source.segments.length &&
    source.segments.every((s) => s?.kind === "CURVE")
      ? curveSplinePath(source)
      : curveSamplePath(source);
  if (path.state !== "ready") return path;
  const matrix = curveRenderingMatrix(source);
  if (!matrix) return fail("UnsupportedCurveRendering");
  const commands = mapCurveCommands(path.commands, (point) =>
    affinePoint(matrix, point)?.map(hwpUnitPixels),
  );
  if (!commands) return fail("InvalidCurveRendering");
  const bounds = commandBounds(commands);
  if (!bounds) return fail("InvalidCurveRendering");
  return {
    state: "resolved",
    interpretation: path.interpretation,
    node: source.node,
    commands,
    bounds,
  };
}

export function translateCurveGeometry(geometry, origin) {
  const fail = () => ({ state: "unavailable", error: "InvalidCurvePageGeometry" });
  if (
    geometry?.state !== "resolved" ||
    !Array.isArray(origin) ||
    origin.length !== 2 ||
    !Array.from(origin).every(Number.isFinite) ||
    !Array.isArray(geometry.commands) ||
    !geometry.commands.length
  )
    return fail();
  const measured = commandBounds(geometry.commands);
  if (
    !measured ||
    !geometry.bounds ||
    !["x", "y", "width", "height"].every((key) => measured[key] === geometry.bounds[key])
  )
    return fail();
  const commands = mapCurveCommands(geometry.commands, (point) => [
    point[0] + origin[0],
    point[1] + origin[1],
  ]);
  if (!commands) return fail();
  const b = geometry.bounds;
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width < 0 || b.height < 0)
    return fail();
  const bounds = { ...b, x: b.x + origin[0], y: b.y + origin[1] };
  if (
    ![bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height].every(Number.isFinite)
  )
    return fail();
  return { ...geometry, state: "placed", commands, bounds };
}
