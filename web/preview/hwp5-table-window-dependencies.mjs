import { hwp5WindowIdentities } from "./hwp5-window-identities.mjs";
// Native table ownership discovery only; other object adapters remain separate.
export function hwp5TableWindowDependencies(editor, projection) {
  const { ordinals, resolve } = hwp5WindowIdentities(projection),
    dependencies = new Map();
  const link = (child, parent) => {
    if (child === parent) return;
    if (!dependencies.has(child)) dependencies.set(child, []);
    const values = dependencies.get(child);
    if (!values.includes(parent)) values.push(parent);
  };
  for (const { index: section } of projection.sections) {
    const placements = new Map(),
      owners = new Map(),
      represented = new Set();
    for (const row of editor.tablePlacements(section)) {
      if (placements.has(row.tableNode)) throw new Error("WindowDependencyBindingMismatch");
      resolve(section, row.paragraph);
      placements.set(row.tableNode, row);
    }
    for (const row of editor.tableBindings(section)) {
      const placement = placements.get(row.tableNode);
      if (!placement || owners.has(row.paragraph))
        throw new Error("WindowDependencyBindingMismatch");
      owners.set(row.paragraph, row);
      const child = resolve(section, row.paragraph),
        host = resolve(section, placement.paragraph);
      link(child, host);
      // Retain one cell identity when the selected host owns a table; do not
      // expand a huge cell or every omitted cell paragraph into editable text.
      if (!represented.has(row.tableNode)) {
        represented.add(row.tableNode);
        link(host, child);
      }
    }
    for (const row of placements.values()) {
      if (row.parentTableNode == null) {
        if (row.parentListNode != null || owners.has(row.paragraph))
          throw new Error("WindowDependencyBindingMismatch");
      } else {
        const parent = placements.get(row.parentTableNode),
          owner = owners.get(row.paragraph);
        if (
          !parent ||
          parent === row ||
          owner?.tableNode !== parent.tableNode ||
          owner.listNode !== row.parentListNode
        )
          throw new Error("WindowDependencyBindingMismatch");
      }
      const seen = new Set();
      let current = row;
      while (current) {
        if (seen.has(current.tableNode)) throw new Error("WindowDependencyOwnershipCycle");
        seen.add(current.tableNode);
        current = current.parentTableNode == null ? null : placements.get(current.parentTableNode);
      }
    }
  }
  return { total: ordinals.size, ordinals, dependencies };
}
