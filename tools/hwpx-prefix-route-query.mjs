import { insertPrefix } from "./hwpx-prefix-edit-probe.mjs";

// Reuse the edit route SSOT, but expose only queries and intercepted mutators.
export function queryPrefixRoute(editor, section, paragraph) {
  const view = {
    canEdit: (...args) => editor.canEdit(...args),
    canEditOutsideField:
      typeof editor.canEditOutsideField === "function"
        ? (...args) => editor.canEditOutsideField(...args)
        : undefined,
    anchorText: (...args) => editor.anchorText(...args),
    fieldLabels: (...args) => editor.fieldLabels(...args),
    fieldRangeTarget:
      typeof editor.fieldRangeTarget === "function"
        ? (...args) => editor.fieldRangeTarget(...args)
        : undefined,
    splice: () => "plain",
    spliceAnchored: () => "anchored",
    spliceFieldLabel: () => "field",
  };
  return insertPrefix(view, section, paragraph, "");
}
