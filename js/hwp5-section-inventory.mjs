export const availableSectionExports = Object.freeze(["hwp5_text_read_available", "hwp5_text_declared_sections", "hwp5_text_distribution"]);

export function sectionInventory(declared, available) {
  if (![declared, available].every(value => Number.isInteger(value) && value >= 1 && value <= 1024)) throw new Error("InvalidSectionInventory");
  return { declared, available, mismatch: declared !== available };
}

export function checkedSectionInventory(value) {
  const result = sectionInventory(value?.declared, value?.available);
  if (value.mismatch !== result.mismatch) throw new Error("InvalidSectionInventory");
  return result;
}
