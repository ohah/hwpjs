import { validateHwp5MasterPageSources } from "../../js/hwp5-master-page-sources.mjs";

/** Original declarations bound to current ownership; no page selection inferred. */
export function attachHwp5MasterPages(editor, content) {
  content.masterPageSources = [];
  content.masterPageSourceErrors = [];
  if (!editor) return content;
  const flows = content.currentParagraphFlows ?? [];
  for (const section of new Set(
    flows.filter((row) => row.host === "master_page").map((row) => row.section),
  )) {
    try {
      const sources = validateHwp5MasterPageSources(editor.masterPageSources(section));
      const members = flows.filter((row) => row.section === section && row.host === "master_page");
      const matches = (source, row) =>
        row.list_node === source.list_node && row.parent_node === source.owner_node;
      if (
        sources.some((source) => !members.some((row) => matches(source, row))) ||
        members.some((row) => !sources.some((source) => matches(source, row)))
      )
        throw new Error("Hwp5MasterPageBindingMismatch");
      content.masterPageSources.push(...sources.map((row) => ({ ...row, section })));
    } catch (error) {
      content.masterPageSourceErrors.push({ section, error: error.message });
    }
  }
  return content;
}
