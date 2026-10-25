import { validShapeLayoutValues } from "./hwpx-shape-layout-values.mjs";
import { validShapePaintValues } from "./hwpx-shape-paint-values.mjs";
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const coordinate = value => value === null || Number.isInteger(value) && value >= -0x80000000 && value <= 0xffffffff;
const optionalBoolean = value => value === null || typeof value === "boolean";
export function validShapeCommonSource(value) {
  if (!validShapeLayoutValues(value)) return false;
  if (Object.hasOwn(value, "component_sizes")) {
    const sizes = value.component_sizes;
    if (!object(sizes) || !["original", "current"].every(key => sizes[key] === null || object(sizes[key])
      && [sizes[key].width, sizes[key].height].every(n => n === null || uint(n)))) return false;
  }
  if (Object.hasOwn(value, "stroke_style") && !(value.stroke_style === null || uint(value.stroke_style) && value.stroke_style <= 17)) return false;
  if (value.stroke && value.stroke_style !== undefined && value.stroke_style !== value.stroke.style) return false;
  if (["stroke", "stroke_error", "paint"].some(key => Object.hasOwn(value, key)) && !validShapePaintValues(value)) return false;
  const r = value.rendering;
  if (!object(r) || !Array.isArray(r.flip) || r.flip.length !== 2 || !Array.from(r.flip).every(optionalBoolean)
    || !(r.angle === null || uint(r.angle)) || !optionalBoolean(r.reverse) || !optionalBoolean(r.rotate_image)
    || !Array.isArray(r.center) || r.center.length !== 2 || !Array.from(r.center).every(coordinate)) return false;
  return r.matrix === null
    ? ["UnsupportedPictureMatrixSequence", "IncompletePictureMatrix", "NonFinitePictureMatrix"].includes(r.matrix_error)
    : Array.isArray(r.matrix) && r.matrix.length === 6 && Array.from(r.matrix).every(Number.isFinite) && r.matrix_error === null;
}
