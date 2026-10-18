import { boundHwp5ColumnSources } from "./hwp5-column-window-dependencies.mjs";
import { hwp5WindowFlows } from "./hwp5-window-flows.mjs";
import { attachHwp5ColumnDisplay } from "./hwp5-column-display.mjs";

export function attachHwp5WindowColumns(editor, content) {
  const { displayed, completeFlows } = hwp5WindowFlows(editor, content);
  content.columnSources = [];
  for (const [section, flows] of completeFlows) {
    const sources = boundHwp5ColumnSources(editor, section, flows);
    for (const source of sources.values()) if (displayed.has(`${section}:${source.current_paragraph}`)) content.columnSources.push({ ...source, section });
  }
  return attachHwp5ColumnDisplay(content);
}
