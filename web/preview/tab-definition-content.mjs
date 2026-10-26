import { validateTabDefinitions } from "../../js/hwpx-tab-definitions.mjs";

/** Immutable resource snapshots bind only through current paragraph shape references. */
export function attachTabDefinitions(editor, content) {
  content.tabDefinitions = null;
  delete content.tabDefinitionsError;
  const selected = [];
  for (const paragraph of content.paragraphs) {
    paragraph.tabDefinition = null;
    delete paragraph.tabDefinitionError;
    if (paragraph.text.includes("\t") && !paragraph.clipped) selected.push(paragraph);
  }
  if (!selected.length) return content;
  try {
    if (typeof editor.tabDefinitions !== "function")
      throw new Error("HwpxTabDefinitionsAbiUnavailable");
    const rows = validateTabDefinitions(editor.tabDefinitions());
    content.tabDefinitions = rows;
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const paragraph of selected) {
      const id = paragraph.tabDefinitionId;
      if (!Number.isInteger(id) || id < 0 || id > 0xffffffff || !byId.has(id)) {
        paragraph.tabDefinitionError = "TabDefinitionReferenceUnavailable";
        continue;
      }
      paragraph.tabDefinition = byId.get(id);
    }
  } catch (error) {
    content.tabDefinitionsError = error.message;
    for (const paragraph of selected) paragraph.tabDefinitionError = error.message;
  }
  return content;
}
