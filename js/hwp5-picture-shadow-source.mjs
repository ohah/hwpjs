// Keep IEEE-754 wire bits intact, including nonfinite patterns. Painting policy
// is separate and must not turn unknown selectors into display defaults.
export function validateHwp5PictureShadowSource(shadow, flags) {
  if (shadow === undefined) return; // Older optional API provides flags only.
  if (shadow === null) {
    if (flags & 1) throw Error('InvalidHwp5PictureShadowSource');
    return;
  }
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const signed = (value) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
  const p = shadow.properties;
  if (
    !(flags & 1) ||
    !p ||
    !['style', 'alignment', 'rotate_with_shape'].every((key) => signed(p[key])) ||
    ![
      'transparency_bits',
      'blur_bits',
      'direction_bits',
      'distance_bits',
      'skew_x_bits',
      'skew_y_bits',
      'scale_x_bits',
      'scale_y_bits',
    ].every((key) => uint(p[key])) ||
    !signed(shadow.color_type) ||
    !uint(shadow.color_value) ||
    !uint(shadow.color_effect_count)
  )
    throw Error('InvalidHwp5PictureShadowSource');
}
