export function drawingStyleLayoutArgs(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)
    || Object.keys(options).some(key => !["border", "tail"].includes(key))) throw new Error("InvalidDrawingStyleLayout");
  const border = ["spec11", "observed13"].indexOf(options.border);
  const tail = ["fill_only", "alpha_shadow", "alpha_shadow_metadata"].indexOf(options.tail);
  if (border < 0 || tail < 0) throw new Error("InvalidDrawingStyleLayout");
  return [border, tail];
}
export function validateHwp5DrawingStyleSources(rows) {
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const uint = value => integer(value, 0, 0xffffffff);
  const byte = value => integer(value, 0, 255);
  const signed = value => integer(value, -2147483648, 2147483647);
  const optional = (value, check) => value === null || check(value);
  const fail = () => { throw new Error("InvalidHwp5DrawingStyleSources"); };
  if (!Array.isArray(rows)) fail();
  const seen = new Set();
  for (const row of rows) {
    const b = row?.border;
    if (!row || !uint(row.component_node) || !uint(row.owner_node) || row.owner_node >= row.component_node || seen.has(row.component_node)
      || !b || !uint(b.color) || !signed(b.width) || !uint(b.attributes?.raw) || !byte(b.outline)
      || !uint(row.fill_flags) || typeof row.fill_known !== "boolean" || !uint(row.extra_bytes)) fail();
    seen.add(row.component_node);
    if (row.fill_known !== ((row.fill_flags & ~7) === 0)) fail();
    const pattern = row.pattern, image = row.image;
    if (!optional(pattern, p => p && uint(p.background) && uint(p.foreground) && signed(p.kind))
      || !optional(row.gradient_colors, uint) || !optional(row.additional_bytes, uint)
      || !optional(image, p => p && byte(p.mode) && p.picture && integer(p.picture.contrast, -128, 127)
        && integer(p.picture.brightness, -128, 127) && byte(p.picture.effect) && integer(p.picture.bin_data_id, 0, 65535))) fail();
    if (row.fill_known) {
      if ((pattern !== null) !== !!(row.fill_flags & 1) || (image !== null) !== !!(row.fill_flags & 2)
        || (row.gradient_colors !== null) !== !!(row.fill_flags & 4) || row.additional_bytes === null) fail();
    } else if ([pattern, image, row.gradient_colors, row.additional_bytes, row.alpha, row.shadow, row.metadata].some(v => v !== null)) fail();
    if ((row.alpha === null) !== (row.shadow === null)) fail();
    if (Object.hasOwn(row, "gradient")) {
      const g = row.gradient;
      if (g === null ? row.gradient_colors !== null : !g || !row.fill_known || !(row.fill_flags & 4)
        || !byte(g.kind) || !["angle", "center_x", "center_y", "blur"].every(key => uint(g[key]))
        || !optional(g.blur_center, byte) || !Array.isArray(g.colors) || g.colors.length !== row.gradient_colors
        || !Array.from(g.colors).every(uint) || !Array.isArray(g.positions)
        || g.positions.length !== (g.colors.length > 2 ? g.colors.length : 0) || !Array.from(g.positions).every(signed)) fail();
    }
    if (row.alpha !== null) {
      const alpha = row.alpha;
      if (!alpha) fail();
      for (const [key, mask] of [["pattern", 1], ["gradient", 4], ["image", 2]]) {
        if (!optional(alpha[key], byte) || (alpha[key] !== null) !== !!(row.fill_flags & mask)) fail();
      }
      const s = row.shadow;
      if (!s || !uint(s.kind) || !uint(s.color) || !signed(s.offset_x) || !signed(s.offset_y)) fail();
    }
    if (!optional(row.metadata, m => m && uint(m.instance_id) && byte(m.reserved) && byte(m.shadow_alpha))
      || row.metadata !== null && row.shadow === null) fail();
  }
  return rows;
}
export function decodeHwp5DrawingStyleSources(bytes) {
  return validateHwp5DrawingStyleSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
