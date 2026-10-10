import { placeFootnoteArea } from "./footnote-area-placement.mjs";

// 확정 행과 현재 후보의 참조만 예약합니다. 후보를 확정 전 캐시에 저장하지 않습니다.
export function createFootnoteColumnReservation(notes, policy, separatorHeight) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Array.isArray(notes) || policy?.state !== "selected" || policy.kind !== "footnote" || !Number.isFinite(separatorHeight) || separatorHeight < 0
    || notes.some(note => note?.kind !== "footnote" || note.section !== policy.section || !Number.isSafeInteger(note.hostParagraph) || note.hostParagraph < 0
      || !Number.isSafeInteger(note.anchorUnit) || note.anchorUnit < 0)) return unavailable("InvalidFootnoteReservation");
  const notesFor = (rows, pageOrdinal, columnOrdinal, candidate) => notes.filter(note =>
    rows.some(row => row.pageOrdinal === pageOrdinal && row.columnOrdinal === columnOrdinal && references(row, note)) || candidate && references(candidate, note));
  const references = (row, note) => row?.kind === "text" && row.section === note.section && row.paragraph === note.hostParagraph
    && Number.isSafeInteger(row.startUnit) && Number.isSafeInteger(row.endUnit) && row.startUnit <= note.anchorUnit && note.anchorUnit < row.endUnit;
  const columnBottom = (candidate, { column, pageOrdinal, columnOrdinal, placedRows }) => {
    const selected = notesFor(placedRows, pageOrdinal, columnOrdinal, candidate);
    if (!selected.length) return column.y + column.height;
    const placed = placeFootnoteArea(selected, { ...policy, beneathText: false }, column, column.y, separatorHeight);
    if (placed.state === "placed") return placed.bodyBottom;
    return placed.error === "FootnoteAreaOverflow" ? column.y : NaN;
  };
  return { state: "ready", columnBottom, notesFor };
}
