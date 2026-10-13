import { hwp5WindowIdentities } from "./hwp5-window-identities.mjs";
import { validateHwp5DrawingAnchors } from "../../js/hwp5-drawing-anchors.mjs";
import { validateHwp5DrawingComponentSources } from "../../js/hwp5-drawing-component-sources.mjs";
import { validateHwp5DrawingListSources } from "../../js/hwp5-drawing-list-sources.mjs";

export function hwp5DrawingWindowDependencies(editor, projection) {
  const { total, ordinals, resolve } = hwp5WindowIdentities(projection), dependencies = new Map();
  const link = (child, parent) => {
    if (child === parent) throw new Error("WindowDependencyBindingMismatch");
    if (!dependencies.has(child)) dependencies.set(child, []);
    const values = dependencies.get(child); if (!values.includes(parent)) values.push(parent);
  };
  for (const section of projection.sections) {
    const flows = editor.paragraphFlow(section.index), claimed = new Set();
    if (flows.length !== section.paragraphs.length || flows.some((row, index) => row.paragraph !== index)) throw new Error("WindowDependencyBindingMismatch");
    const lists = validateHwp5DrawingListSources(editor.drawingListSources(section.index));
    const anchors = new Map(validateHwp5DrawingAnchors(editor.drawingAnchors(section.index)).map(row => [row.control_node, row]));
    const components = lists.some(row => row.kind === "body")
      ? new Map(validateHwp5DrawingComponentSources(editor.drawingComponentSources(section.index)).map(row => [row.component_node, row])) : new Map();
    const root = node => {
      const seen = new Set();
      while (true) {
        if (seen.has(node)) throw new Error("WindowDependencyOwnershipCycle");
        seen.add(node);
        const component = components.get(node);
        if (!component) throw new Error("WindowDependencyBindingMismatch");
        const anchor = anchors.get(component.owner_node);
        if (anchor) {
          if (anchor.component_node !== component.component_node) throw new Error("WindowDependencyBindingMismatch");
          return anchor.control_node;
        }
        node = component.owner_node;
      }
    };
    for (const source of lists) {
      const anchor = anchors.get(source.control_node);
      if (!anchor || source.kind === "body" && root(source.owner_node) !== source.control_node) throw new Error("WindowDependencyBindingMismatch");
      const host = resolve(section.index, anchor.paragraph);
      const members = flows.filter(row => row.host === "drawing" && row.parent_node === source.owner_node && row.list_node === source.list_node);
      if (!members.length && source.paragraph_count !== 0) throw new Error("MissingWindowDrawingBody");
      for (const row of members) {
        if (claimed.has(row.paragraph)) throw new Error("WindowDependencyBindingMismatch");
        claimed.add(row.paragraph);
        const child = resolve(section.index, row.paragraph);
        link(child, host); link(host, child);
      }
    }
    if (flows.some(row => row.host === "drawing" && !claimed.has(row.paragraph))) throw new Error("WindowDependencyBindingMismatch");
  }
  return { total, ordinals, dependencies };
}
