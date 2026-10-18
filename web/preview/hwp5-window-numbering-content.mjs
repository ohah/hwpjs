import { hwp5WindowFlows } from "./hwp5-window-flows.mjs";
import { validateHwp5PageControlSources } from "../../js/hwp5-page-control-sources.mjs";
import { validateHwp5AutomaticNumberSources } from "../../js/hwp5-automatic-number-sources.mjs";
import { attachHwp5AutomaticNumbers } from "./hwp5-automatic-number-content.mjs";
import { attachHwp5PageControls } from "./hwp5-page-control-content.mjs";
import { attachHwp5DocumentProperties } from "./hwp5-document-numbering.mjs";

export function attachHwp5WindowNumbering(editor, content) {
  const { displayed, completeFlows } = hwp5WindowFlows(editor, content), scoped = Object.create(editor);
  scoped.automaticNumberSources = section => completeFlows.has(section)
    ? validateHwp5AutomaticNumberSources(editor.automaticNumberSources(section)).filter(row => displayed.has(`${section}:${row.paragraph}`)) : [];
  scoped.pageControlSources = section => {
    if (!completeFlows.has(section)) return [];
    const rows = validateHwp5PageControlSources(editor.pageControlSources(section));
    if (rows.some(row => !displayed.has(`${section}:${row.paragraph}`))) throw new Error("MissingHwp5WindowPageControl");
    return rows;
  };
  for (const section of completeFlows.keys()) scoped.pageControlSources(section);
  return attachHwp5DocumentProperties(scoped, attachHwp5PageControls(scoped, attachHwp5AutomaticNumbers(scoped, content)));
}
