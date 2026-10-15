import { bindNoteBodies } from "./note-body-bindings.mjs";
import { layoutContent } from "./layout.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { measureCreatedNoteBody } from "./created-note-body-measurement.mjs";
import { createdTableIdentity } from "../../js/created-table-identity.mjs";

// 호출자가 지정한 폭으로 측정하며 페이지 위치와 주석 사이 간격은 결정하지 않습니다.
export function measureNoteBodies(content, width, measure, maxRows = 20000) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Number.isFinite(width) || width <= 0 || typeof measure !== "function" || !Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("InvalidNoteBodyMeasurement");
  const bound = bindNoteBodies(content);
  if (bound.state !== "bound") return bound;
  const noteHosts = new Set(bound.notes.flatMap(note => note.paragraphs.map(paragraph => `${note.section}:${paragraph}`)));
  if (content.createdTables !== undefined && !Array.isArray(content.createdTables)) return unavailable("InvalidCreatedTableNoteOwner");
  const createdOwners = new Set();
  for (const table of content.createdTables ?? []) {
    try { createdTableIdentity(table?.identity); } catch { return unavailable("InvalidCreatedTableNoteOwner"); }
    if (!noteHosts.has(`${table.section}:${table.hostParagraph}`)) return unavailable("UnsupportedCreatedTableNoteOwner");
    const key = `${table.section}:${table.identity}`;
    if (createdOwners.has(key)) return unavailable("AmbiguousCreatedTableNoteOwner");
    createdOwners.add(key);
  }
  const paragraphs = new Map(content.paragraphs.map(p => [`${p.section}:${p.paragraph}`, p]));
  const flows = new Map(content.paragraphFlows.map(f => [`${f.section}:${f.paragraph}`, f]));
  const notes = [];
  let rowCount = 0;
  for (const note of bound.notes) {
    const selected = note.paragraphs.map(id => paragraphs.get(`${note.section}:${id}`));
    if (selected.some(p => flows.get(`${p.section}:${p.paragraph}`).column_declaration?.count > 1)) return unavailable("UnsupportedNoteBodyColumns");
    if (rowCount >= maxRows) return unavailable("NoteBodyMeasurementLimit");
    const ids = new Set(selected.map(p => `${p.section}:${p.paragraph}`));
    const tables = content.createdTables?.filter(table => ids.has(`${table.section}:${table.hostParagraph}`)) ?? [];
    if (tables.length && selected.some(p => {
      const flow = flows.get(`${p.section}:${p.paragraph}`);
      return flow.page_break === true || flow.column_break === true;
    })) return unavailable("UnsupportedCreatedNoteParagraphBreak");
    const flow = tables.length ? measureCreatedNoteBody(selected, tables, content.format, width, measure, maxRows - rowCount)
      : layoutContent({ paragraphs: selected, limited: false }, width, measure, maxRows - rowCount, { documentBody: true });
    if (flow.state === "unavailable") return flow;
    if (flow.limited) return unavailable("NoteBodyMeasurementLimit");
    const coverage = pageParagraphCoverage(selected, flow.rows.filter(row => !row.createdCell && (row.kind !== "text" || row.startUnit < row.endUnit || paragraphs.get(`${row.section}:${row.paragraph}`)?.text === "")));
    if (coverage.state !== "complete") return coverage;
    if (!Number.isFinite(flow.height) || flow.height <= 0) return unavailable("InvalidNoteBodyMeasurement");
    rowCount += flow.rowCount ?? flow.rows.length;
    notes.push({ ...note, width, height: flow.height, rows: flow.rows.map(row => ({ ...row, noteNode: note.noteNode,
      ...(row.createdCell ? { noteListNode: note.listNode } : { listNode: note.listNode }), noteKind: note.kind })),
      boxes: flow.boxes ?? [], numberPrefixes: flow.numberPrefixes ?? [], createdCellParagraphs: flow.createdCellParagraphs ?? [] });
  }
  return { state: "measured", notes, rowCount };
}
