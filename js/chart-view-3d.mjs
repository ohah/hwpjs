import { object, uint, field } from "./chart-display-fields.mjs";
// Optional additive wire member; omission by older cores is not a default view.
export function validChartView3D(value, occupied = null) {
  if (value === undefined || value === null) return true;
  if (
    !object(value) ||
    !uint(value.node) ||
    value.node === 0 ||
    occupied?.has(value.node) ||
    typeof value.unparsed_children !== "boolean"
  )
    return false;
  const ranges = {
    rotation_x: [-90, 90],
    rotation_y: [0, 360],
    height_percent: [5, 500],
    depth_percent: [20, 2000],
    perspective: [0, 240],
  };
  const nodes = new Set([value.node]);
  for (const key of [...Object.keys(ranges), "right_angle_axes"]) {
    const accepts =
      key === "right_angle_axes"
        ? (v) => typeof v === "boolean"
        : (v) => Number.isInteger(v) && v >= ranges[key][0] && v <= ranges[key][1];
    const leaf = value[key];
    if (!field(leaf, accepts, value.node)) return false;
    if (leaf !== null) {
      if (nodes.has(leaf.node) || occupied?.has(leaf.node)) return false;
      nodes.add(leaf.node);
    }
  }
  return true;
}
