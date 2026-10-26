// TABLE 속성의 관측 의미와 미확정 비트를 단독으로 분류합니다.
export function hwp5TableFlags(flags) {
  if (!Number.isInteger(flags) || flags < 0 || flags > 0xffffffff)
    throw new Error("InvalidHwp5TableFlags");
  return {
    page_break: ["none", "table", "cell", null][flags & 3],
    repeat_header: Boolean(flags & 4),
    no_adjust: Boolean(flags & 8),
    inner_margin_setup: Boolean(flags & 0x04000000),
    unknown_flags: (flags & ~0x0400000f) >>> 0,
  };
}
