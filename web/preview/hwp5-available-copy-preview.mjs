import { availableSectionCopyExports, validateAvailableSectionCopyOption } from "../../js/hwp5-available-section-copy.mjs";

export function availableSectionCopyCapability(module) {
  if (!(module instanceof WebAssembly.Module)) return false;
  const names = new Set(WebAssembly.Module.exports(module).filter(row => row.kind === "function").map(row => row.name));
  return availableSectionCopyExports.every(name => names.has(name));
}

export function availableSectionCopyRequest(message) {
  const value = message.availableSectionCopy === undefined ? false : message.availableSectionCopy;
  validateAvailableSectionCopyOption(value, message.distribution ?? false, message.normalizeObservedCfb ?? false);
  if (value && message.availableSectionsOnly === true) throw new Error("ConflictingAvailableSectionCopyOptions");
  if (value && (message.format ?? "hwp5") !== "hwp5") throw new Error("UnsupportedAvailableSectionCopyFormat");
  return value;
}
