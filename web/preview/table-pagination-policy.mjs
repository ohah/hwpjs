// 저장된 쪽 나눔 값과 실제 적용 정책은 다릅니다. 원본 값은 수정하지 않습니다.
export function tablePaginationPolicy(table) {
  const stored = table?.pagination?.page_break;
  const inline = table?.sourceGeometry?.geometry?.treat_as_character;
  if (!["none", "table", "cell"].includes(stored) || typeof inline !== "boolean")
    return { state: "unavailable", error: "UnprovedTablePaginationPolicy" };
  return {
    state: "resolved",
    storedPageBreak: stored,
    effectivePageBreak: inline ? "none" : stored,
    reason: inline ? "inline-object" : "source-page-break",
  };
}
