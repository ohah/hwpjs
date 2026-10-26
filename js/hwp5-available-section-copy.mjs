import { sectionInventory } from "./hwp5-section-inventory.mjs";
export const availableSectionCopyExports = Object.freeze([
  "hwp5_edit_open_available_section_copy",
  "hwp5_edit_available_section_copy_info",
]);

export function validateAvailableSectionCopyOption(value, distribution, normalizeObservedCfb) {
  if (typeof value !== "boolean") throw new TypeError("Invalid available section copy option");
  if (value && (distribution || normalizeObservedCfb))
    throw new Error("ConflictingAvailableSectionCopyOptions");
}

export function decodeAvailableSectionCopyInfo(bytes) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (value === null) return null;
  const inventory = sectionInventory(value?.declared, value?.available);
  if (!inventory.mismatch) throw new Error("InvalidAvailableSectionCopyInfo");
  return {
    normalized: true,
    historyBaseline: "available-sections-copy",
    deviations: null,
    sectionInventory: inventory,
    missingContentRecovered: false,
  };
}
