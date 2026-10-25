import { object, field, uint, oneOf } from "./chart-display-fields.mjs";
export function validChartSpatialSettings(value, kind, owner, leaves) {
  if (value === undefined) return true; // Older candidate: no spatial capability implied.
  const spatial = ["bar3DChart", "line3DChart", "area3DChart"].includes(kind);
  if (!spatial) return value === null;
  if (!object(value) || !field(value.gap_depth, v => uint(v) && v <= 500, owner) ||
    !field(value.shape, oneOf(["box", "cone", "coneToMax", "cylinder", "pyramid", "pyramidToMax"]), owner)) return false;
  if (kind !== "bar3DChart" && value.shape !== null) return false;
  for (const leaf of [value.gap_depth, value.shape]) if (leaf !== null) {
    if (leaves.has(leaf.node)) return false;
    leaves.add(leaf.node);
  }
  return true;
}
