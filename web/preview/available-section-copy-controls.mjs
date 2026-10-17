import { checkedSectionInventory } from "../../js/hwp5-section-inventory.mjs";
import { createDocumentReopenChoice } from "./document-reopen-choice.mjs";

export const availableSectionCopyConsent = "저장된 구역만으로 새 편집 사본을 만듭니다. 저장되지 않은 내용은 복원되지 않습니다. 저장·실행 취소 기준은 사본이며 원본 파일은 변경하지 않습니다. 계속하시겠습니까?";

export function availableSectionCopySummary(content) {
  const info = content?.normalizationInfo;
  if (info?.historyBaseline !== "available-sections-copy") return null;
  if (content.format !== "hwp5" || content.readOnly !== false || info.normalized !== true || info.missingContentRecovered !== false) throw new Error("InvalidAvailableSectionCopyInfo");
  const { declared, available, mismatch } = checkedSectionInventory(info.sectionInventory);
  if (!mismatch) throw new Error("InvalidAvailableSectionCopyInfo");
  return `선언 ${declared}구역 · 저장된 ${available}구역의 편집 사본입니다. 누락 내용은 복원되지 않았습니다. 저장·실행 취소 기준은 이 사본이며 원본 파일은 변경하지 않았습니다.`;
}

export function createAvailableSectionCopyControls({ confirm, ...options }) {
  return createDocumentReopenChoice({
    ...options,
    confirm: () => confirm(availableSectionCopyConsent),
    accepts: reply => reply?.kind === "load" && reply.error === "SectionCountMismatch" && reply.availableSectionCopyAvailable === true,
    summary: availableSectionCopySummary,
    offered: "저장된 구역만으로 편집 사본을 만들 수 있습니다. 누락된 내용은 복원되지 않으며 별도 동의가 필요합니다.",
    preparing: "저장된 구역의 편집 사본을 준비합니다…",
    failed: "편집 사본 열기 실패",
    cancelled: "사본 편집을 취소했습니다. 원본 파일은 변경하지 않았습니다.",
  });
}
