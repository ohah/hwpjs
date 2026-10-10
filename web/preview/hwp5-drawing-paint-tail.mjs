// 선택된 꼬리와 검증된 구형 부재 프로필을 구분합니다. 원값을 채우지 않습니다.
export function hwp5DrawingPaintTail(style) {
  if (!style?.fill_known) return { state: "unavailable", error: "UnselectedHwp5DrawingPaintTail" };
  if (style.alpha === null || style.shadow === null || style.metadata === null) {
    const absent = style.fileVersion === 0x05000107 && style.tailLayout === "fill_only" && style.borderLayout === "observed13"
      && style.alpha === null && style.shadow === null && style.metadata === null && style.extra_bytes === 0
      && style.fill_flags === 0 && style.additional_bytes === 0;
    return absent ? { state: "selected", policy: "observed-absent-empty-fill", shadowType: 0 }
      : { state: "unavailable", error: "UnselectedHwp5DrawingPaintTail" };
  }
  if (style.extra_bytes !== 0 || style.metadata.reserved !== 0 || style.shadow.kind !== 0) return { state: "unavailable", error: "UnsupportedHwp5DrawingPaintTail" };
  return { state: "selected", policy: "selected-tail", shadowType: style.shadow.kind };
}
