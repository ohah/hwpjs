import { hwp5WindowFlows } from "./hwp5-window-flows.mjs";
import { validateHwp5PageAreaSources } from "../../js/hwp5-page-area-sources.mjs";
import { validateHwp5MasterPageSources } from "../../js/hwp5-master-page-sources.mjs";
import { attachHwp5PageAreas } from "./hwp5-page-area-content.mjs";
import { attachHwp5MasterPages } from "./hwp5-master-page-content.mjs";

export function attachHwp5WindowRepeatedAreas(editor, content) {
  const { displayed, completeFlows, selectedFlows } = hwp5WindowFlows(editor, content);
  const areas = new Map(), masters = new Map(), scoped = Object.create(editor);
  for (const [section, flows] of completeFlows) {
    const pageAreas = validateHwp5PageAreaSources(editor.pageAreaSources(section));
    const masterPages = validateHwp5MasterPageSources(editor.masterPageSources(section));
    for (const source of [...pageAreas, ...masterPages.map(row => ({ ...row, kind: "master_page" }))]) {
      const members = flows.filter(row => row.host === source.kind && row.parent_node === source.owner_node && row.list_node === source.list_node);
      if (source.paragraph_count !== 0 && !members.length || members.some(row => !displayed.has(`${section}:${row.paragraph}`))) throw new Error("MissingHwp5WindowRepeatedBody");
    }
    areas.set(section, pageAreas); masters.set(section, masterPages);
  }
  content.currentParagraphFlows = selectedFlows;
  scoped.pageAreaSources = section => areas.get(section) ?? [];
  scoped.masterPageSources = section => masters.get(section) ?? [];
  return attachHwp5MasterPages(scoped, attachHwp5PageAreas(scoped, content));
}
