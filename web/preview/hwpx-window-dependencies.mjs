import { hwpxWindowIdentities } from './hwpx-window-identities.mjs';

// Source relationships only: no edit values, fallback guesses, or layout state.
export function hwpxWindowDependencies(editor, projection) {
  const { parents, sections, groups, resolve } = hwpxWindowIdentities(projection);
  for (const section of sections) {
    const tables = new Map();
    const tableGroup = (node) => {
      if (!tables.has(node)) tables.set(node, new Set());
      return tables.get(node);
    };
    for (const row of editor.tableBindings(section))
      tableGroup(row.tableNode).add(resolve(section, row.paragraph));
    for (const row of editor.tablePlacements(section))
      tableGroup(row.tableNode).add(resolve(section, row.paragraph));
    for (const row of editor.tableCaptionBindings(section))
      tableGroup(row.owner.table_node).add(resolve(section, row.paragraph));
    for (const values of tables.values()) groups.push([...values]);
    const drawings = new Map();
    for (const row of editor.drawingTextBindings(section)) {
      if (!drawings.has(row.drawingNode)) drawings.set(row.drawingNode, new Set());
      const ordinal = resolve(section, row.paragraph);
      const host = parents.get(ordinal);
      if (host === undefined) throw new Error('MissingWindowDrawingHost');
      drawings.get(row.drawingNode).add(ordinal);
      drawings.get(row.drawingNode).add(host);
    }
    for (const values of drawings.values()) groups.push([...values]);
  }
  return groups;
}
