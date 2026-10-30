// 표시용 행 단위 계약입니다. Native owner/reference를 만들지 않습니다.
export const plainFootnoteUnitsAdapter = Object.freeze({
  validate(note, width) {
    return note.atomicScene ||
      ['boxes', 'flowPictures', 'numberPrefixes'].some((key) => note[key]?.length) ||
      !Array.isArray(note.rows) ||
      !note.rows.length ||
      note.width !== width ||
      !Number.isFinite(note.height) ||
      note.height <= 0
      ? 'UnsupportedFootnoteContinuationContent'
      : null;
  },
  units(note) {
    return note.rows;
  },
  fragment(note, { start, end, base, height, normalizedUnits }) {
    void base;
    return {
      ...note,
      height,
      rows: normalizedUnits,
      continuation: start > 0,
      fragmentStart: start,
      fragmentEnd: end,
    };
  },
});
