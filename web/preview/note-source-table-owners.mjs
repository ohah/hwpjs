import { mixedInlineTablePolicy } from "./mixed-inline-table-policy.mjs";

/** Resolve source body/note table ownership before measuring or binding notes. */
export function selectNoteSourceTables(content, { floatingNotes = false } = {}) {
  const fail = (error) => ({ state: "unavailable", error });
  if (!content || typeof content !== "object") return fail("InvalidNoteSourceBodyTables");
  if (typeof floatingNotes !== "boolean") return fail("InvalidNoteSourceBodyTables");
  const tables = content.tables ?? [],
    cells = new Set(),
    bodyCells = new Set(),
    noteCells = new Set();
  const bodyTables = [],
    noteTables = [],
    noteTablesByNote = new Map();
  const selected = () => ({
    state: "selected",
    cellParagraphs: cells,
    bodyCellParagraphs: bodyCells,
    noteCellParagraphs: noteCells,
    bodyTables,
    noteTables,
    noteTablesByNote,
    hasTables: tables.length > 0,
  });
  if (!Array.isArray(tables)) return fail("InvalidNoteSourceBodyTables");
  if (!tables.length) return selected();
  if (
    !["hwpx", "hwp5"].includes(content.format) ||
    !Array.isArray(content.paragraphs) ||
    !Array.isArray(content.paragraphFlows) ||
    content.pageSettings?.length !== 1
  )
    return fail("UnsupportedNoteSourceBodyTables");
  const section = content.pageSettings[0]?.section_ordinal;
  if (!Number.isSafeInteger(section) || section < 0) return fail("InvalidNoteSourceBodyTables");
  const group = (rows) => {
    const result = new Map();
    for (const row of rows) {
      if (
        !row ||
        !Number.isSafeInteger(row.section) ||
        row.section < 0 ||
        !Number.isSafeInteger(row.paragraph) ||
        row.paragraph < 0
      )
        return null;
      const key = `${row.section}:${row.paragraph}`,
        matches = result.get(key) ?? [];
      matches.push(row);
      result.set(key, matches);
    }
    return result;
  };
  const paragraphs = group(content.paragraphs),
    flows = group(content.paragraphFlows),
    tableIds = new Set();
  if (!paragraphs || !flows) return fail("InvalidNoteSourceBodyTables");
  for (const table of tables) {
    if (
      !table ||
      table.section !== section ||
      !Number.isSafeInteger(table.tableNode) ||
      table.tableNode < 0 ||
      tableIds.has(table.tableNode) ||
      !Array.isArray(table.cells) ||
      !table.cells.length ||
      table.cells.some((cell) => !cell)
    )
      return fail("InvalidNoteSourceBodyTables");
    tableIds.add(table.tableNode);
    const hosts = flows.get(`${section}:${table.hostParagraph}`) ?? [];
    const policy = mixedInlineTablePolicy(table, {
      whole: true,
      diagnostics: content.tableGeometryErrors,
    });
    const floatingNote =
      floatingNotes &&
      policy.reasons?.length === 1 &&
      policy.reasons[0] === "FloatingTable" &&
      hosts.length === 1 &&
      ["footnote", "endnote"].includes(hosts[0].host);
    if (policy.state !== "supported" && !floatingNote) {
      const host = hosts.length === 1 ? hosts[0] : null,
        context = host?.note_context;
      return {
        ...policy,
        ...(["footnote", "endnote"].includes(host?.host) &&
        host.top_level === false &&
        context?.kind === host.host &&
        Number.isSafeInteger(context.note_node) &&
        context.note_node >= 0 &&
        Number.isSafeInteger(context.list_node) &&
        context.list_node >= 0
          ? {
              noteKind: context.kind,
              noteNode: context.note_node,
              noteListNode: context.list_node,
              hostParagraph: table.hostParagraph,
            }
          : {}),
      };
    }
    if (hosts.length !== 1) return fail("UnsupportedNoteSourceTableOwner");
    const host = hosts[0],
      body = host.host === "body";
    if (
      body
        ? host.top_level !== true
        : !["footnote", "endnote"].includes(host.host) ||
          host.top_level !== false ||
          host.note_context?.kind !== host.host ||
          !Number.isSafeInteger(host.note_context.note_node) ||
          host.note_context.note_node < 0 ||
          !Number.isSafeInteger(host.note_context.list_node) ||
          host.note_context.list_node < 0
    )
      return fail("UnsupportedNoteSourceTableOwner");
    (body ? bodyTables : noteTables).push(table);
    if (!body) {
      const key = `${section}:${host.note_context.note_node}`,
        group = noteTablesByNote.get(key) ?? [];
      group.push(table);
      noteTablesByNote.set(key, group);
    }
    for (const cell of table.cells) {
      if (!cell || !Array.isArray(cell.paragraphs) || !cell.paragraphs.length)
        return fail("InvalidNoteSourceBodyTables");
      for (const paragraph of cell.paragraphs) {
        const owners = paragraphs.get(`${section}:${paragraph}`) ?? [];
        const cellFlows = flows.get(`${section}:${paragraph}`) ?? [];
        if (
          cells.has(paragraph) ||
          owners.length !== 1 ||
          owners[0].tableCell?.tableNode !== table.tableNode ||
          owners[0].tableCell?.listNode !== cell.listNode ||
          cellFlows.length !== 1 ||
          cellFlows[0].host !==
            (content.format === "hwp5" ? "table_cell" : body ? "other" : host.host) ||
          cellFlows[0].top_level !== false ||
          cellFlows[0].note_context != null
        )
          return fail("InvalidNoteSourceTableCellOwner");
        cells.add(paragraph);
        (body ? bodyCells : noteCells).add(paragraph);
      }
    }
  }
  return selected();
}
