import { validateHwp5AutomaticNumberSources } from "../../js/hwp5-automatic-number-sources.mjs";
import { sourceDisplayPosition } from "./text-offsets.mjs";
import { hwp5NumberFormat } from "./number-format.mjs";

function ornament(unit) {
  if (unit >= 0xd800 && unit <= 0xdfff) throw new Error("UnsupportedHwp5NumberOrnament");
  return unit === 0 ? "" : String.fromCharCode(unit);
}
export function hwp5AutomaticNumberDisplay(row, host) {
  validateHwp5AutomaticNumberSources([row]);
  const format = hwp5NumberFormat(row.shape);
  const known = row.kind <= 5 && format !== null && (!row.superscript || row.kind === 1) && (row.attributes & ~0x1fff) === 0 && row.extra_bytes === 0;
  return { values: { type_known: row.kind <= 5, num: row.number },
    format: { type_known: known, raw: [known ? format : "UNKNOWN", ornament(row.symbol), ornament(row.prefix), ornament(row.suffix)], supscript: row.superscript },
    hwp5PageNumber: known && row.kind === 0 && ["header", "footer"].includes(host) };
}
export function attachHwp5AutomaticNumbers(editor, content) {
  content.automaticNumberErrors = [];
  for (const paragraph of content.paragraphs) { paragraph.automaticNumbers = []; paragraph.automaticNumberPrefixes = []; }
  if (!editor) return content;
  for (let section = 0; section < editor.sectionCount(); section++) {
    try {
      const rows = validateHwp5AutomaticNumberSources(editor.automaticNumberSources(section)), prepared = [];
      for (const row of rows) {
        const paragraph = content.paragraphs.find(p => p.section === section && p.paragraph === row.paragraph);
        if (!paragraph || paragraph.clipped) throw new Error("Hwp5AutomaticNumberOwnerMismatch");
        const unit = sourceDisplayPosition(row.current_unit, paragraph.sourceOffsets, paragraph.text.length);
        const end = sourceDisplayPosition(row.current_unit + 8, paragraph.sourceOffsets, paragraph.text.length);
        if (end !== unit + 1 || paragraph.text[unit] !== "\ufffc") throw new Error("Hwp5AutomaticNumberAnchorMismatch");
        const host = content.currentParagraphFlows.find(flow => flow.section === section && flow.paragraph === row.paragraph)?.host;
        prepared.push({ paragraph, number: { unit, numberNode: row.control_node, hwp5Source: row, source: hwp5AutomaticNumberDisplay(row, host) } });
      }
      for (const { paragraph, number } of prepared) paragraph.automaticNumbers.push(number);
    } catch (error) { content.automaticNumberErrors.push({ section, error: error.message }); }
  }
  return content;
}
