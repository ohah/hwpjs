// Native projection owns result coordinates and text; this module only adapts Worker messages.
import { clipText } from "./content.mjs";
const exportsRequired = [
  "hwpx_edit_splice_manual_formula_result", "hwpx_edit_manual_formula_result_max_bytes",
  "hwpx_edit_manual_formula_result_targets", "hwpx_edit_manual_formula_result_range_target",
  "hwpx_edit_manual_formula_result_display_text",
];
export function formulaResultTextAvailable(editor, module) {
  const names = new Set(WebAssembly.Module.exports(module).filter(entry => entry.kind === "function").map(entry => entry.name));
  return ["spliceManualFormulaResult", "manualFormulaResultTargets", "manualFormulaResultRangeTarget", "manualFormulaResultDisplayText"].every(name => typeof editor?.[name] === "function") && exportsRequired.every(name => names.has(name));
}
export function projectFormulaResultText(editor, paragraph, available, maxUnits, snapshot) {
  paragraph.manualFormulaResults = [];
  if (!available || paragraph.clipped || paragraph.plainEditable) return 0;
  const targets = snapshot === undefined ? editor.manualFormulaResultTargets(paragraph.section, paragraph.paragraph + 1) : snapshot.targets;
  if (!Array.isArray(targets)) throw new Error("InvalidFormulaResultTarget");
  if (!targets.length) return 0;
  const text = snapshot === undefined ? editor.manualFormulaResultDisplayText(paragraph.section, paragraph.paragraph + 1) : snapshot.text;
  if (typeof text !== "string" || targets.some(target => !uint(target.beginElement) || !uint(target.start) || !uint(target.end) || target.end < target.start || target.end > text.length)) throw new Error("InvalidFormulaResultTarget");
  const before = paragraph.text.length;
  paragraph.text = clipText(text, maxUnits);
  if (paragraph.text !== text) {
    paragraph.clipped = true;
    paragraph.plainEditable = false; paragraph.anchorEditable = false; paragraph.fieldLabels = [];
  } else paragraph.manualFormulaResults = targets;
  return paragraph.text.length - before;
}
export function spliceFormulaResultText(editor, module, message) {
  if (!formulaResultTextAvailable(editor, module)) return false;
  const target = editor.manualFormulaResultRangeTarget(message.section, message.paragraph + 1, message.startUnit, message.endUnit);
  if (target === null) return false;
  if (!uint(target.beginElement) || !uint(target.start) || !uint(target.end) || target.start > message.startUnit || target.end < message.endUnit || target.end < target.start) throw new Error("InvalidFormulaResultTarget");
  editor.spliceManualFormulaResult(message.section, target.beginElement, message.startUnit - target.start, message.endUnit - message.startUnit, message.text);
  return true;
}
// selectionEditQuery already converted the display paragraph to native 1-based.
export function formulaResultTextRangeAllowed(editor, module, section, nativeParagraph, start, end) {
  return formulaResultTextAvailable(editor, module) && editor.manualFormulaResultRangeTarget(section, nativeParagraph, start, end) !== null;
}
function uint(value) { return Number.isInteger(value) && value >= 0 && value <= 0xffffffff; }
