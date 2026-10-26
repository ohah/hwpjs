/** Wire validation only; raw resource colors and absent alpha remain distinct. */
export function decodeHwp5BorderFillSources(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 64 * 1024 * 1024)
    throw new Error("InvalidHwp5BorderFillSources");
  return validateHwp5BorderFillSources(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
}
export function validateHwp5BorderFillSources(rows) {
  const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const uint = (v) => integer(v, 0, 0xffffffff),
    byte = (v) => integer(v, 0, 255),
    signed = (v) => integer(v, -2147483648, 2147483647);
  const optional = (v, check) => v === null || check(v),
    fail = () => {
      throw new Error("InvalidHwp5BorderFillSources");
    };
  if (!Array.isArray(rows) || rows.length > 1_000_000) fail();
  for (const [i, r] of rows.entries()) {
    if (
      !r ||
      r.id !== i + 1 ||
      !uint(r.record_index) ||
      r.record_index < i ||
      (i > 0 && r.record_index <= rows[i - 1].record_index) ||
      !integer(r.attributes, 0, 65535) ||
      !Array.isArray(r.borders) ||
      r.borders.length !== 5 ||
      !Array.from(r.borders).every((b) => b && byte(b.kind) && byte(b.width) && uint(b.color)) ||
      !uint(r.fill_flags) ||
      typeof r.fill_known !== "boolean" ||
      r.fill_known !== ((r.fill_flags & ~7) === 0)
    )
      fail();
    if (!r.fill_known) {
      if (
        !uint(r.unknown_fill_bytes) ||
        [
          r.pattern,
          r.gradient,
          r.image,
          r.alpha,
          r.additional_present,
          r.additional_bytes,
          r.extra_bytes,
        ].some((v) => v !== null)
      )
        fail();
      continue;
    }
    if (
      r.unknown_fill_bytes !== null ||
      typeof r.additional_present !== "boolean" ||
      !uint(r.additional_bytes) ||
      !uint(r.extra_bytes) ||
      (!r.additional_present && (r.additional_bytes !== 0 || r.fill_flags > 1)) ||
      (r.pattern !== null) !== !!(r.fill_flags & 1) ||
      (r.gradient !== null) !== !!(r.fill_flags & 4) ||
      (r.image !== null) !== !!(r.fill_flags & 2)
    )
      fail();
    const p = r.pattern,
      g = r.gradient,
      image = r.image;
    if (p !== null && (!p || !uint(p.background) || !uint(p.foreground) || !signed(p.kind))) fail();
    if (
      g !== null &&
      (!g ||
        !byte(g.kind) ||
        !["angle", "center_x", "center_y", "blur"].every((k) => uint(g[k])) ||
        !optional(g.blur_center, byte) ||
        !Array.isArray(g.colors) ||
        g.colors.length > 1_000_000 ||
        !Array.from(g.colors).every(uint) ||
        !Array.isArray(g.positions) ||
        g.positions.length !== (g.colors.length > 2 ? g.colors.length : 0) ||
        !Array.from(g.positions).every(signed))
    )
      fail();
    if (g !== null && (g.blur_center !== null) !== (r.additional_bytes === 1)) fail();
    if (
      image !== null &&
      (!image ||
        !byte(image.mode) ||
        !image.picture ||
        !integer(image.picture.contrast, -128, 127) ||
        !integer(image.picture.brightness, -128, 127) ||
        !byte(image.picture.effect) ||
        !integer(image.picture.bin_data_id, 0, 65535))
    )
      fail();
    if (
      r.alpha !== null &&
      (!r.alpha ||
        r.extra_bytes !== 0 ||
        r.fill_flags === 0 ||
        ![
          ["pattern", 1],
          ["gradient", 4],
          ["image", 2],
        ].every(([k, flag]) => (r.fill_flags & flag ? byte(r.alpha[k]) : r.alpha[k] === null)))
    )
      fail();
  }
  return rows;
}
