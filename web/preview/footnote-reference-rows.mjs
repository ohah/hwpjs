// 일반 예약기와 plain continuation이 공유하는 기존 text-row 참조 판정입니다.
export const footnoteTextReference = (row, note) =>
  row?.kind === 'text' &&
  row.section === note.section &&
  row.paragraph === note.hostParagraph &&
  Number.isSafeInteger(row.startUnit) &&
  Number.isSafeInteger(row.endUnit) &&
  row.startUnit <= note.anchorUnit &&
  note.anchorUnit < row.endUnit;
