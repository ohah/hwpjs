import { footnoteTextReference as referencesText } from './footnote-reference-rows.mjs';
import { placeFootnoteArea } from './footnote-area-placement.mjs';
const ownedReservations = new WeakMap();
export const isFootnoteColumnReservation = (callback) =>
  typeof callback === 'function' && ownedReservations.has(callback);
export const hasCellFootnoteReferences = (callback, section, paragraphs) =>
  (ownedReservations.get(callback) ?? []).some(
    (note) => note.section === section && paragraphs.has(note.hostParagraph),
  );

// 확정 행과 현재 후보의 참조만 예약합니다. 후보를 확정 전 캐시에 저장하지 않습니다.
export function createFootnoteColumnReservation(notes, policy, separatorHeight) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (
    !Array.isArray(notes) ||
    policy?.state !== 'selected' ||
    policy.kind !== 'footnote' ||
    !Number.isFinite(separatorHeight) ||
    separatorHeight < 0 ||
    notes.some(
      (note) =>
        note?.kind !== 'footnote' ||
        note.section !== policy.section ||
        !Number.isSafeInteger(note.hostParagraph) ||
        note.hostParagraph < 0 ||
        !Number.isSafeInteger(note.anchorUnit) ||
        note.anchorUnit < 0,
    )
  )
    return unavailable('InvalidFootnoteReservation');
  const notesFor = (rows, pageOrdinal, columnOrdinal, candidate) =>
    notes.filter(
      (note) =>
        rows.some(
          (row) =>
            row.pageOrdinal === pageOrdinal &&
            row.columnOrdinal === columnOrdinal &&
            references(row, note),
        ) ||
        (candidate && references(candidate, note)),
    );
  const references = (row, note) =>
    referencesText(row, note) ||
    (row?.createdHost !== undefined &&
      Array.isArray(row.referenceRows) &&
      row.referenceRows.some((source) => referencesText(source, note))) ||
    (Number.isSafeInteger(row?.cellFragment ?? row?.mandatoryCellFragment) &&
      (row.cellFragment ?? row.mandatoryCellFragment) >= 0 &&
      Number.isSafeInteger(row.cellTableNode) &&
      row.cellTableNode >= 0 &&
      Array.isArray(row.cellReferenceRows) &&
      row.cellReferenceRows.some((source) => referencesText(source, note))) ||
    (((Number.isSafeInteger(row?.tableIndex) && row.tableIndex >= 0) ||
      Array.isArray(row?.inlineTableAnchors)) &&
      Array.isArray(row.sourceTableReferenceRows) &&
      row.sourceTableReferenceRows.some((source) => referencesText(source, note)));
  const columnBottom = (candidate, { column, pageOrdinal, columnOrdinal, placedRows }) => {
    const selected = notesFor(placedRows, pageOrdinal, columnOrdinal, candidate);
    if (!selected.length) return column.y + column.height;
    const placed = placeFootnoteArea(
      selected,
      { ...policy, beneathText: false },
      column,
      column.y,
      separatorHeight,
    );
    if (placed.state === 'placed') return placed.bodyBottom;
    return placed.error === 'FootnoteAreaOverflow' ? column.y : NaN;
  };
  ownedReservations.set(columnBottom, notes);
  return { state: 'ready', columnBottom, notesFor };
}
