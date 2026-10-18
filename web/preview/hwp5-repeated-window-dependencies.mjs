import { hwp5WindowIdentities } from "./hwp5-window-identities.mjs";
import { validateHwp5PageAreaSources } from "../../js/hwp5-page-area-sources.mjs";
import { validateHwp5MasterPageSources } from "../../js/hwp5-master-page-sources.mjs";

// Preserve all declared repeated lists in a selected section, not guessed parity.
export function hwp5RepeatedWindowDependencies(editor, projection) {
  const { total, ordinals, resolve } = hwp5WindowIdentities(projection), dependencies = new Map();
  const link = (child, parent) => {
    if (child === parent) return;
    if (!dependencies.has(child)) dependencies.set(child, []);
    const values = dependencies.get(child); if (!values.includes(parent)) values.push(parent);
  };
  for (const section of projection.sections) {
    const flows = editor.paragraphFlow(section.index), claimed = new Set();
    if (flows.length !== section.paragraphs.length || flows.some((row, index) => row.paragraph !== index)) throw new Error("WindowDependencyBindingMismatch");
    const anchors = new Map(editor.structuralAnchors(section.index).map(row => [row.control_node, row]));
    const sources = [
      ...validateHwp5PageAreaSources(editor.pageAreaSources(section.index)).map(row => ({ ...row, anchorKind: row.kind })),
      ...validateHwp5MasterPageSources(editor.masterPageSources(section.index)).map(row => ({ ...row, kind: "master_page", anchorKind: "section" })),
    ];
    for (const source of sources) {
      const anchor = anchors.get(source.owner_node);
      if (!anchor || anchor.kind !== source.anchorKind) throw new Error("WindowDependencyBindingMismatch");
      const host = resolve(section.index, anchor.paragraph);
      const members = flows.filter(row => row.host === source.kind && row.parent_node === source.owner_node && row.list_node === source.list_node);
      if (!members.length && source.paragraph_count !== 0) throw new Error("MissingWindowRepeatedBody");
      for (const row of members) {
        if (claimed.has(row.paragraph)) throw new Error("WindowDependencyBindingMismatch");
        claimed.add(row.paragraph);
        const child = resolve(section.index, row.paragraph); link(child, host); link(host, child);
      }
      for (const row of flows) if (row.host === "body") link(resolve(section.index, row.paragraph), host);
    }
    if (flows.some(row => ["header", "footer", "master_page"].includes(row.host) && !claimed.has(row.paragraph))) throw new Error("WindowDependencyBindingMismatch");
  }
  return { total, ordinals, dependencies };
}
