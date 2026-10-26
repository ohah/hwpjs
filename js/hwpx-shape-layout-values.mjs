export function validShapeLayoutValues(value) {
  const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  const optional = (n, check) => n === null || check(n);
  const signed = (n) => Number.isSafeInteger(n) && n >= -2147483648 && n <= 4294967295;
  const bool = (n) => n === null || typeof n === "boolean";
  const array = (a, length, check) => Array.isArray(a) && a.length === length && a.every(check);
  const g = value?.geometry,
    p = value?.position,
    f = value?.flow;
  return Boolean(
    g &&
    p &&
    f &&
    [g.width, g.height].every((n) => optional(n, uint)) &&
    optional(g.width_relative, (n) => uint(n) && n <= 4) &&
    optional(g.height_relative, (n) => uint(n) && n <= 2) &&
    bool(g.treat_as_character) &&
    [g.horizontal_offset, g.vertical_offset].every((n) => optional(n, signed)) &&
    array(p.flags, 4, bool) &&
    Array.isArray(p.relations) &&
    p.relations.length === 4 &&
    p.relations.every((n, i) => optional(n, (n) => uint(n) && n <= [2, 3, 4, 4][i])) &&
    optional(f.text_wrap, (n) => uint(n) && n <= 5) &&
    optional(f.text_flow, (n) => uint(n) && n <= 3) &&
    optional(f.z_order, signed) &&
    array(f.outside_margins, 4, (n) => optional(n, signed)),
  );
}
