import { hwp5WindowIdentities } from "./hwp5-window-identities.mjs";
import { validateHwp5FieldSpans } from "../../js/hwp5-field-spans.mjs";

// Consume native source-bound spans; do not parse marker bytes in JavaScript.
export function hwp5FieldWindowDependencies(editor, projection) {
  const { total, ordinals, resolve } = hwp5WindowIdentities(projection), dependencies = new Map();
  const link = (child, parent) => {
    if (child === parent) return;
    if (!dependencies.has(child)) dependencies.set(child, []);
    const values = dependencies.get(child); if (!values.includes(parent)) values.push(parent);
  };
  const sameOwner = (a, b) => a.host === b.host && a.parent_node === b.parent_node && a.list_node === b.list_node;
  for (const section of projection.sections) {
    const flows = editor.paragraphFlow(section.index);
    if (flows.length !== section.paragraphs.length || flows.some((row, index) => row.paragraph !== index)) throw new Error("WindowDependencyBindingMismatch");
    for (const span of validateHwp5FieldSpans(editor.fieldSpans(section.index))) {
      const first = resolve(section.index, span.begin.paragraph);
      resolve(section.index, span.end.paragraph);
      const owner = flows[span.begin.paragraph];
      if (!sameOwner(owner, flows[span.end.paragraph])) throw new Error("WindowDependencyBindingMismatch");
      for (let paragraph = span.begin.paragraph; paragraph <= span.end.paragraph; paragraph++) {
        if (!sameOwner(owner, flows[paragraph])) continue;
        const member = resolve(section.index, paragraph);
        link(member, first); link(first, member);
      }
    }
  }
  return { total, ordinals, dependencies };
}
