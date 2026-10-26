// Shared wire validation only; source metadata is not paint permission.
export function validShapePaintValues(source) {
  const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  const optional = (n, check) => n === null || check(n);
  if (source?.stroke === null) {
    if (
      ![
        "UnsupportedLineStrokeDecoration",
        "UnsupportedLineStrokeColor",
        "UnsupportedLineStrokeStyle",
      ].includes(source.stroke_error)
    )
      return false;
  } else if (
    !source?.stroke ||
    source.stroke_error !== null ||
    !optional(source.stroke.color, (n) => uint(n) && n <= 0xffffff) ||
    !optional(source.stroke.width, uint) ||
    !optional(source.stroke.style, (n) => uint(n) && n <= 6)
  )
    return false;
  const paint = source.paint;
  return Boolean(
    paint &&
    [paint.fill_node, paint.shadow_node].every((n) => optional(n, uint)) &&
    optional(paint.shadow_type, (n) => uint(n) && n <= 14) &&
    !(paint.shadow_node === null && paint.shadow_type !== null),
  );
}
