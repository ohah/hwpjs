/** Shared nullable scalar contract for JSON shape geometry, position and flow. */
export function validateShapeSourceValues(value) {
  const fail = () => {
    throw new Error('InvalidShapeSourceValues');
  };
  const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
  const signed = (v) => Number.isSafeInteger(v) && v >= -2147483648 && v <= 4294967295;
  const optional = (v, check) => v === null || check(v);
  const geometry = value?.geometry;
  if (
    !geometry ||
    ![geometry.width, geometry.height].every((v) => optional(v, uint)) ||
    !optional(geometry.width_relative, (v) => uint(v) && v <= 4) ||
    !optional(geometry.height_relative, (v) => uint(v) && v <= 2) ||
    ![null, false, true].includes(geometry.treat_as_character) ||
    ![geometry.horizontal_offset, geometry.vertical_offset].every((v) => optional(v, signed))
  )
    fail();
  if (Object.hasOwn(value, 'position')) {
    const p = value.position;
    if (
      !p ||
      !Array.isArray(p.flags) ||
      p.flags.length !== 4 ||
      !p.flags.every((v) => [null, false, true].includes(v)) ||
      !Array.isArray(p.relations) ||
      p.relations.length !== 4 ||
      !p.relations.every((v, i) => optional(v, (n) => uint(n) && n <= [2, 3, 4, 4][i]))
    )
      fail();
  }
  if (Object.hasOwn(value, 'flow')) {
    const f = value.flow;
    if (
      !f ||
      !optional(f.text_wrap, (n) => uint(n) && n <= 5) ||
      !optional(f.text_flow, (n) => uint(n) && n <= 3) ||
      !optional(f.z_order, signed) ||
      !Array.isArray(f.outside_margins) ||
      f.outside_margins.length !== 4 ||
      !f.outside_margins.every((v) => optional(v, signed))
    )
      fail();
  }
  return value;
}
