// Session availability and text-edit admission are distinct native contracts.
export function canStartDocumentSession(content) {
  if (!content || !["hwp5", "hwpx"].includes(content.format) || content.availableSectionsOnly === true) return false;
  return !content.readOnly || content.distributionEditingAvailable === true || content.normalizationEditingAvailable === true
    || content.format === "hwp5" && content.observedDocInfoEditingAvailable === true
    || content.format === "hwp5" && content.editorSessionAvailable === true;
}
export function documentFormatLabel(content) {
  if (content.format === "hwpx") return "HWPX · " + (content.readOnly ? "읽기 전용" : "제한적 텍스트 편집 실험");
  const suffix = content.availableSectionsOnly ? " · 저장된 구역만 읽기 전용"
    : content.readOnly ? content.primarySource === "distribution_viewtext" ? " · 배포용 읽기 전용" : " · 읽기 전용" : "";
  return "HWP " + content.version + suffix;
}
