import { selectNoteSourceTables } from "./note-source-table-owners.mjs";

/** Body-only selection retained for callers that cannot compose note tables. */
export function selectNoteSourceBodyTables(content) {
  const selected = selectNoteSourceTables(content);
  if (selected.state !== "selected") return selected;
  if (selected.noteTables.length) return { state: "unavailable", error: "UnsupportedNoteSourceTableOwner" };
  return { state: "selected", cellParagraphs: selected.bodyCellParagraphs, hasTables: selected.hasTables };
}
