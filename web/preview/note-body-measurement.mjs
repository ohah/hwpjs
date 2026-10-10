import { bindNoteBodies } from "./note-body-bindings.mjs";
import { layoutContent } from "./layout.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";

// 호출자가 지정한 폭으로 측정하며 페이지 위치와 주석 사이 간격은 결정하지 않습니다.
export function measureNoteBodies(content, width, measure, maxRows = 20000) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Number.isFinite(width) || width <= 0 || typeof measure !== "function" || !Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("InvalidNoteBodyMeasurement");
  const bound = bindNoteBodies(content);
  if (bound.state !== "bound") return bound;
  const paragraphs = new Map(content.paragraphs.map(p => [`${p.section}:${p.paragraph}`, p]));
  const flows = new Map(content.paragraphFlows.map(f => [`${f.section}:${f.paragraph}`, f]));
  const notes = [];
  let rowCount = 0;
  for (const note of bound.notes) {
    const selected = note.paragraphs.map(id => paragraphs.get(`${note.section}:${id}`));
    if (selected.some(p => flows.get(`${p.section}:${p.paragraph}`).column_declaration?.count > 1)) return unavailable("UnsupportedNoteBodyColumns");
    if (rowCount >= maxRows) return unavailable("NoteBodyMeasurementLimit");
    const flow = layoutContent({ paragraphs: selected, limited: false }, width, measure, maxRows - rowCount, { documentBody: true });
    if (flow.limited) return unavailable("NoteBodyMeasurementLimit");
    const coverage = pageParagraphCoverage(selected, flow.rows);
    if (coverage.state !== "complete") return coverage;
    if (!Number.isFinite(flow.height) || flow.height <= 0) return unavailable("InvalidNoteBodyMeasurement");
    rowCount += flow.rows.length;
    notes.push({ ...note, width, height: flow.height, rows: flow.rows.map(row => ({ ...row, noteNode: note.noteNode, listNode: note.listNode, noteKind: note.kind })) });
  }
  return { state: "measured", notes, rowCount };
}
