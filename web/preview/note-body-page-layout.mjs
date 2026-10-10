import { measureNoteBodies } from "./note-body-measurement.mjs";
import { selectNotePagePolicy } from "./note-page-policy.mjs";
import { noteSeparatorGeometry } from "./note-separator-geometry.mjs";
import { createFootnoteColumnReservation } from "./footnote-column-reservation.mjs";
import { placeFootnoteArea } from "./footnote-area-placement.mjs";
import { layoutContent } from "./layout.mjs";
import { paginateBodyRows } from "./page-row-flow.mjs";
import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";

// 본문·각주·미주의 조립만 소유합니다. 원본 정책과 측정·예약은 공통 모듈을 사용합니다.
export function layoutNoteBodyPages(content, measure, maxRows = 20000) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || content.pageSettings?.length !== 1 || content.limited || content.noteShapesError
    || content.tables?.length || content.drawings?.length || content.pictures?.length || content.lines?.length) return unavailable("UnsupportedNotePageContent");
  const setting = content.pageSettings[0], reference = pageReferenceBoxes(setting, { x: 20, y: 20 });
  if (reference.state !== "placed") return reference;
  const flows = content.paragraphFlows ?? [];
  if (flows.some(flow => flow.section !== setting.section_ordinal || !["body", "footnote", "endnote"].includes(flow.host)
    || flow.column_declaration?.count > 1)) return unavailable("UnsupportedNotePageFlow");
  const measured = measureNoteBodies(content, reference.boxes.page.width, measure, maxRows);
  if (measured.state !== "measured") return measured;
  const footnotes = measured.notes.filter(note => note.kind === "footnote"), endnotes = measured.notes.filter(note => note.kind === "endnote");
  const policies = new Map(), separators = new Map();
  for (const kind of new Set(measured.notes.map(note => note.kind))) {
    let policy;
    if (content.hwp5NotePolicies !== undefined) {
      if (content.hwp5NoteShapeErrors?.length || !Array.isArray(content.hwp5NotePolicies)) return unavailable("IncompleteHwp5NotePagePolicies");
      const selected = content.hwp5NotePolicies.filter(row => row.section === setting.section_ordinal && row.kind === kind);
      if (selected.length !== 1) return unavailable("AmbiguousNotePagePolicy");
      policy = selected[0];
    } else policy = selectNotePagePolicy(content.noteShapes, setting.section_ordinal, kind);
    if (policy.state !== "selected") return policy;
    const separator = noteSeparatorGeometry(policy, reference.boxes.page.width);
    if (separator.state !== "selected") return separator;
    policies.set(kind, policy); separators.set(kind, separator);
  }
  const bodyIds = new Set(flows.filter(flow => flow.host === "body").map(flow => flow.paragraph));
  const body = content.paragraphs.filter(paragraph => bodyIds.has(paragraph.paragraph));
  const bodyBudget = maxRows - measured.rowCount;
  if (bodyBudget < 1) return unavailable("NotePageLayoutLimit");
  const bodyFlow = layoutContent({ paragraphs: body, limited: false }, reference.boxes.page.width, measure, bodyBudget, { documentBody: true });
  if (bodyFlow.limited) return unavailable("NotePageLayoutLimit");
  const rows = [...bodyFlow.rows], pageFlows = flows.filter(flow => flow.host === "body");
  if (endnotes.length) {
    const policy = policies.get("endnote"), separator = separators.get("endnote");
    for (const [index, note] of endnotes.entries()) {
      const height = index === 0 ? policy.aboveLine + separator.height + policy.belowLine : policy.betweenNotes;
      let firstTextHeight = 0;
      for (const row of note.rows) { firstTextHeight += row.height; if (row.kind === "text") break; }
      if (height > 0) rows.push({ kind: "gap", text: "", section: note.section, paragraph: note.paragraphs[0], height,
        keepNextHeight: firstTextHeight,
        ...(index === 0 ? { noteSeparator: { ...separator, offset: policy.aboveLine } } : {}) });
      rows.push(...note.rows);
      for (const paragraph of note.paragraphs) {
        const source = flows.find(flow => flow.section === note.section && flow.paragraph === paragraph);
        pageFlows.push({ ...source, host: "body", top_level: true });
      }
    }
  }
  if (rows.length + footnotes.reduce((sum, note) => sum + note.rows.length, 0) > maxRows) return unavailable("NotePageLayoutLimit");
  const reservation = footnotes.length ? createFootnoteColumnReservation(footnotes, policies.get("footnote"), separators.get("footnote").height) : null;
  if (reservation && reservation.state !== "ready") return reservation;
  const page = paginateBodyRows(rows, setting, pageFlows, { maxRows, columnBottom: reservation?.columnBottom });
  if (page.state !== "paginated" || page.limited) return page;
  const resultRows = [...page.rows], noteSeparators = [];
  for (const row of page.rows) if (row.noteSeparator?.height > 0) noteSeparators.push({ x: row.x, y: row.y + row.noteSeparator.offset, width: row.noteSeparator.width, height: row.noteSeparator.height, color: row.noteSeparator.color, pageOrdinal: row.pageOrdinal });
  if (reservation) for (const physical of page.pages) {
    const selected = reservation.notesFor(page.rows, physical.ordinal, 0);
    if (!selected.length) continue;
    const occupied = page.rows.filter(row => row.pageOrdinal === physical.ordinal).reduce((bottom, row) => Math.max(bottom, row.y + row.height), physical.page.y);
    const placed = placeFootnoteArea(selected, policies.get("footnote"), physical.page, occupied, separators.get("footnote").height, maxRows - resultRows.length);
    if (placed.state !== "placed") return placed;
    resultRows.push(...placed.rows.map(row => ({ ...row, pageOrdinal: physical.ordinal, columnOrdinal: 0, referenceBoxes: { paper: physical.paper, page: physical.page, column: physical.page } })));
    const separator = separators.get("footnote");
    if (separator.height > 0) noteSeparators.push({ x: physical.page.x, y: placed.separatorY, width: separator.width, height: separator.height, color: separator.color, pageOrdinal: physical.ordinal });
  }
  const coverage = pageParagraphCoverage(content.paragraphs, resultRows);
  if (coverage.state !== "complete") return coverage;
  return { ...page, rows: resultRows.toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y || a.x - b.x), noteSeparators, spatialRows: true, pageLayoutMode: "measured-note-body" };
}
