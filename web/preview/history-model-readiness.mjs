import { paragraphSelectionOwner } from './paragraph-selection.mjs';
// 기존 core 선택과 이력 선택이 일치하는 단일 본문·원본 표 셀만 geometry 계산 없이 준비합니다.
// 이 판정은 Native 편집 권한이나 화면 paint 완료를 발급하지 않습니다.
export function matchHistoryModelSelection(state, revision, selection, paragraph) {
  if (
    !state ||
    state.status !== 'ready' ||
    state.nativeHistoryRevision !== revision ||
    !Number.isInteger(revision) ||
    revision < 0 ||
    revision >= 0xffffffff ||
    !selection?.anchor ||
    !selection?.focus ||
    !paragraph ||
    typeof paragraph.text !== 'string' ||
    paragraph.clipped ||
    !(paragraph.editable || paragraph.selectable)
  )
    return false;
  const owner = paragraphSelectionOwner(paragraph);
  if (typeof owner !== 'string' || !owner) return false;
  const a = selection.anchor,
    f = selection.focus,
    selected = state.selection;
  if (
    !selected ||
    selected.coordinateSpace !== 'display' ||
    !['hwp5', 'hwpx'].includes(state.content?.format) ||
    selected.format !== state.content.format ||
    !Array.isArray(state.content.paragraphs) ||
    !state.content.paragraphs.includes(paragraph)
  )
    return false;
  for (const key of ['documentId', 'generation', 'operationRevision', 'viewRevision'])
    if (selected[key] !== state[key]) return false;
  if (
    !Number.isSafeInteger(a.section) ||
    a.section < 0 ||
    !Number.isSafeInteger(a.paragraph) ||
    a.paragraph < 0 ||
    a.section !== f.section ||
    a.paragraph !== f.paragraph ||
    a.createdCell ||
    f.createdCell ||
    a.pageArea !== undefined ||
    f.pageArea !== undefined ||
    paragraph.section !== a.section ||
    paragraph.paragraph !== a.paragraph ||
    paragraph.drawingText ||
    paragraph.drawingCaption ||
    (!paragraph.tableCell && paragraph.selectionOwner !== `section:${a.section}:body`) ||
    selected.owner !== owner ||
    selected.section !== a.section ||
    selected.paragraph !== a.paragraph
  )
    return false;
  for (const point of [a, f]) {
    if (!Number.isSafeInteger(point.unit) || point.unit < 0 || point.unit > paragraph.text.length)
      return false;
    const u = point.unit,
      text = paragraph.text;
    if (
      u > 0 &&
      u < text.length &&
      text.charCodeAt(u - 1) >= 0xd800 &&
      text.charCodeAt(u - 1) <= 0xdbff &&
      text.charCodeAt(u) >= 0xdc00 &&
      text.charCodeAt(u) <= 0xdfff
    )
      return false;
  }
  return (
    selected.startUnit === Math.min(a.unit, f.unit) &&
    selected.endUnit === Math.max(a.unit, f.unit) &&
    selected.affinity === (a.unit > f.unit ? 'backward' : 'forward')
  );
}

// 같은 ACK 모델에 대한 이후의 선택 게시만 허용합니다. 새 문서·내용·이력은 재사용하지 않습니다.
export function sameHistoryModelObservation(before, current) {
  if (before === current) return Boolean(current);
  if (
    !before ||
    !current ||
    before.status !== 'ready' ||
    current.status !== 'ready' ||
    before.content !== current.content ||
    before.capabilities !== current.capabilities ||
    before.historyRecoveryRequired !== current.historyRecoveryRequired ||
    before.savedOperationRevision !== current.savedOperationRevision ||
    !Number.isSafeInteger(before.stateVersion) ||
    !Number.isSafeInteger(current.stateVersion) ||
    current.stateVersion <= before.stateVersion
  )
    return false;
  return [
    'editorId',
    'documentId',
    'generation',
    'operationRevision',
    'viewRevision',
    'nativeHistoryRevision',
  ].every((key) => before[key] === current[key]);
}
