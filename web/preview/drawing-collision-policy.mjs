import { drawingAxisGeometry } from "./drawing-axis-geometry.mjs";
import { drawingScaledGeometry } from "./drawing-scaled-geometry.mjs";

export function drawingNeedsCollision(source) {
  return source?.position?.flags?.[1] === true || source?.position?.flags?.[2] === false;
}

// Position flags keep body restriction and object overlap as independent values.
export function drawingCollisionPolicy(source) {
  const fail = () => ({ state: "unavailable", error: "UnsupportedRestrictedDrawingLayout" });
  if (
    !source ||
    source.group_context !== null ||
    source.caption != null ||
    !(drawingAxisGeometry(source) || drawingScaledGeometry(source))
  )
    return fail();
  const restrictToBody = source.position?.flags?.[1],
    allowOverlap = source.position?.flags?.[2];
  if (
    typeof restrictToBody !== "boolean" ||
    typeof allowOverlap !== "boolean" ||
    (restrictToBody && source.position?.relations?.[0] !== 2) ||
    !drawingNeedsCollision(source)
  )
    return fail();
  return { state: "selected", restrictToBody, allowOverlap };
}
