import { hwp5WindowIdentities } from "./hwp5-window-identities.mjs";
import { validateHwp5PageControlSources } from "../../js/hwp5-page-control-sources.mjs";

// Retain actual page-control hosts; do not infer counters from cached page numbers.
export function hwp5PageControlWindowDependencies(editor, projection) {
  const { total, ordinals, resolve } = hwp5WindowIdentities(projection), dependencies = new Map();
  for (const section of projection.sections) {
    const flows = editor.paragraphFlow(section.index);
    if (flows.length !== section.paragraphs.length || flows.some((row, index) => row.paragraph !== index)) throw new Error("WindowDependencyBindingMismatch");
    const hosts = [...new Set(validateHwp5PageControlSources(editor.pageControlSources(section.index)).map(row => resolve(section.index, row.paragraph)))];
    for (const row of flows) if (row.host === "body") {
      const child = resolve(section.index, row.paragraph), parents = hosts.filter(host => host !== child);
      if (parents.length) dependencies.set(child, parents);
    }
  }
  return { total, ordinals, dependencies };
}
