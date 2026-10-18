import { validateHwp5CaptionSources } from "../../js/hwp5-caption-sources.mjs";
import { attachHwp5Captions } from "./hwp5-caption-content.mjs";
import { hwp5WindowFlows } from "./hwp5-window-flows.mjs";

export function attachHwp5WindowCaptions(editor, content) {
  const { displayed, completeFlows, selectedFlows } = hwp5WindowFlows(editor, content);
  content.currentParagraphFlows = selectedFlows;
  const scoped = Object.create(editor);
  scoped.captionSources = section => {
    const selected = new Set((content.tables ?? []).filter(row => row.section === section).map(row => row.tableNode));
    const rows = validateHwp5CaptionSources(editor.captionSources(section)).filter(row => selected.has(row.table_record_node));
    for (const source of rows) {
      const members = completeFlows.get(section).filter(row => row.host === "table_caption" && row.parent_node === source.control_node && row.list_node === source.list_node);
      if (members.some(row => !displayed.has(`${section}:${row.paragraph}`))) throw new Error("MissingHwp5CaptionBody");
    }
    return rows;
  };
  for (const section of completeFlows.keys()) scoped.captionSources(section);
  return attachHwp5Captions(scoped, content);
}
