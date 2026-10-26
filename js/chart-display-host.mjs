import { object, uint } from "./chart-display-fields.mjs";
const optional = (accepts) => (value) => value === null || accepts(value);
const bounded = (max) => (value) => uint(value) && value <= max;
const boolean = (value) => typeof value === "boolean";
const offset = (value) => Number.isInteger(value) && value >= -0x80000000 && value <= 0xffffffff;
export function chartDisplayHost(value, wrapper) {
  if (
    !object(value) ||
    value.wrapper_node !== wrapper ||
    !uint(value.chart_node) ||
    value.chart_node <= wrapper
  )
    return false;
  const g = value.geometry,
    p = value.position;
  return (
    object(g) &&
    object(p) &&
    [g.width, g.height].every(optional(uint)) &&
    optional(bounded(4))(g.width_relative) &&
    optional(bounded(2))(g.height_relative) &&
    optional(boolean)(g.treat_as_character) &&
    [g.horizontal_offset, g.vertical_offset].every(optional(offset)) &&
    Array.isArray(p.flags) &&
    p.flags.length === 4 &&
    p.flags.every(optional(boolean)) &&
    Array.isArray(p.relations) &&
    p.relations.length === 4 &&
    p.relations.every((v, i) => optional(bounded([2, 3, 4, 4][i]))(v))
  );
}
