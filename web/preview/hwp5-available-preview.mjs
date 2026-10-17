import { displayContent } from "./content.mjs";
import { checkedSectionInventory, availableSectionExports } from "../../js/hwp5-section-inventory.mjs";

export function availableSectionsCapability(module) {
  if (!(module instanceof WebAssembly.Module)) return false;
  const names = new Set(WebAssembly.Module.exports(module).filter(entry => entry.kind === "function").map(entry => entry.name));
  return availableSectionExports.every(name => names.has(name));
}

export function availableSectionsRequest(message) {
  const value = message.availableSectionsOnly ?? false;
  if (message.availableSectionsOnly === null || typeof value !== "boolean") throw new Error("InvalidAvailableSectionsPolicy");
  if (value && (message.format ?? "hwp5") !== "hwp5") throw new Error("UnsupportedAvailableSectionsFormat");
  return value;
}

export function availableSectionsContent(preview) {
  if (preview?.readOnly !== true || !["available_bodytext", "available_viewtext"].includes(preview.primarySource)) throw new Error("InvalidAvailableSectionsPreview");
  const inventory = checkedSectionInventory(preview.sectionInventory);
  return { ...displayContent(preview), availableSectionsOnly: true, sectionInventory: inventory };
}

export function availableSectionsSummary(content) {
  if (content?.availableSectionsOnly !== true) return null;
  if (content.readOnly !== true || content.format !== "hwp5") throw new Error("InvalidAvailableSectionsPreview");
  const { declared, available } = checkedSectionInventory(content.sectionInventory);
  return `선언 ${declared}구역 · 저장된 ${available}구역만 읽기 전용으로 표시합니다. 누락된 내용의 복원이 아니며 편집·다운로드를 허용하지 않습니다. 원본 파일은 변경하지 않았습니다.`;
}
