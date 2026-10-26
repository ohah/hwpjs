// 공통 object flags 해석만 소유합니다. 컨테이너별 여백/꼬리/배치 정책은 별도입니다.
export function hwp5UnsupportedObjectFlags(flags, { allowObservedLock = false } = {}) {
  if (!Number.isInteger(flags) || flags < 0 || flags > 0xffffffff) return null;
  const mask = allowObservedLock === true ? 0x80000002 : 0xc0000002;
  return (flags & mask) >>> 0;
}
export function hwp5ObjectFlags(flags, options) {
  if (hwp5UnsupportedObjectFlags(flags, options) !== 0)
    throw new Error("UnsupportedHwp5ObjectFlags");
  const vertical_relative = (flags >>> 3) & 3,
    vertical_alignment = (flags >>> 5) & 7;
  const horizontal_relative = (flags >>> 8) & 3,
    horizontal_alignment = (flags >>> 10) & 7;
  const width_relative = (flags >>> 15) & 7,
    height_relative = (flags >>> 18) & 3,
    text_wrap = (flags >>> 21) & 7;
  if (
    vertical_relative > 2 ||
    vertical_alignment > 4 ||
    horizontal_alignment > 4 ||
    width_relative > 4 ||
    height_relative > 2 ||
    text_wrap > 3
  )
    throw new Error("UnsupportedHwp5ObjectEnum");
  const flow_with_text = Boolean(flags & (1 << 13));
  return {
    vertical_relative,
    vertical_alignment,
    horizontal_relative,
    horizontal_alignment,
    width_relative,
    height_relative,
    size_protected: vertical_relative === 2 && Boolean(flags & (1 << 20)),
    treat_as_character: Boolean(flags & 1),
    text_wrap,
    text_flow: (flags >>> 24) & 3,
    has_caption: Boolean(flags & (1 << 29)),
    affect_line_spacing: Boolean(flags & 4),
    flow_with_text,
    allow_overlap: flow_with_text ? false : Boolean(flags & (1 << 14)),
    hold_anchor: null,
    ...(options?.allowObservedLock === true ? { locked: Boolean(flags & 0x40000000) } : {}),
  };
}
