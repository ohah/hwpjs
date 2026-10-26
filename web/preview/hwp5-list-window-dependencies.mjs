import { hwp5WindowIdentities } from "./hwp5-window-identities.mjs";

// Caption/note ownership comes from current native flow, not inferred XML/text.
export function hwp5ListWindowDependencies(editor, projection) {
  const { total, ordinals, resolve } = hwp5WindowIdentities(projection),
    dependencies = new Map();
  const link = (child, parent) => {
    if (child === parent) return;
    if (!dependencies.has(child)) dependencies.set(child, []);
    const values = dependencies.get(child);
    if (!values.includes(parent)) values.push(parent);
  };
  for (const section of projection.sections) {
    const flows = editor.paragraphFlow(section.index),
      claimed = new Set(),
      lists = new Set();
    if (
      flows.length !== section.paragraphs.length ||
      flows.some((row, index) => row.paragraph !== index)
    )
      throw new Error("WindowDependencyBindingMismatch");
    const attach = (source, host, kind) => {
      if (lists.has(source.list_node)) throw new Error("WindowDependencyBindingMismatch");
      lists.add(source.list_node);
      const hostOrdinal = resolve(section.index, host);
      const members = flows.filter(
        (row) =>
          row.host === kind &&
          row.list_node === source.list_node &&
          row.parent_node === source.control_node,
      );
      if (!members.length && source.paragraph_count !== 0) throw new Error("MissingWindowListBody");
      for (const row of members) {
        if (claimed.has(row.paragraph)) throw new Error("WindowDependencyBindingMismatch");
        claimed.add(row.paragraph);
        const child = resolve(section.index, row.paragraph);
        if (child === hostOrdinal) throw new Error("WindowDependencyBindingMismatch");
        link(child, hostOrdinal);
        link(hostOrdinal, child);
      }
    };
    const placements = new Map();
    for (const row of editor.tablePlacements(section.index)) {
      if (placements.has(row.tableNode)) throw new Error("WindowDependencyBindingMismatch");
      placements.set(row.tableNode, row);
    }
    const captions = editor.captionSources(section.index),
      layouts = new Map();
    if (captions.length)
      for (const row of editor.tableLayoutSources(section.index)) {
        if (layouts.has(row.table_record_node)) throw new Error("WindowDependencyBindingMismatch");
        layouts.set(row.table_record_node, row);
      }
    for (const caption of captions) {
      const placement = placements.get(caption.table_record_node);
      if (!placement || layouts.get(caption.table_record_node)?.table_node !== caption.control_node)
        throw new Error("WindowDependencyBindingMismatch");
      attach(caption, placement.paragraph, "table_caption");
    }
    for (const note of editor.noteSources(section.index)) {
      if (!["footnote", "endnote"].includes(note.kind))
        throw new Error("WindowDependencyBindingMismatch");
      attach(note, note.paragraph, note.kind);
    }
    if (
      flows.some(
        (row) =>
          ["table_caption", "footnote", "endnote"].includes(row.host) &&
          !claimed.has(row.paragraph),
      )
    )
      throw new Error("WindowDependencyBindingMismatch");
  }
  return { total, ordinals, dependencies };
}
