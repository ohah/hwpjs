import { projectNoteFlowPictures } from './note-picture-projection.mjs';
const defineDataProperty = Object.defineProperty;
// 측정된 각주 영역을 한 단에 배치합니다. 참조의 페이지 이동은 페이지 엔진 책임입니다.
export function placeFootnoteArea(
  notes,
  policy,
  column,
  occupiedBottom,
  separatorHeight,
  maxRows = 20000,
) {
  return projectFootnoteArea(notes, policy, column, occupiedBottom, separatorHeight, maxRows, null);
}

// 내부 측정 fragment만 사용합니다. custom adapter는 기존 materialization 경로를 유지합니다.
export function checkFootnoteAreaTrial(
  notes,
  policy,
  column,
  occupiedBottom,
  separatorHeight,
  physicalBottom,
  maxRows = 20000,
  ownedData = false,
) {
  if (ownedData !== true) {
    const placed = projectFootnoteArea(
      notes,
      policy,
      column,
      occupiedBottom,
      separatorHeight,
      maxRows,
      null,
    );
    return placed.state === 'placed'
      ? {
          state: 'placed',
          rowsFit: placed.rows.every(
            (row) => row.y >= occupiedBottom && row.y + row.height <= physicalBottom,
          ),
        }
      : placed;
  }
  // 오직 같은 동기 측정 호출이 새로 만든 own-data 결과만 내부 caller가 선택합니다.
  return projectFootnoteArea(notes, policy, column, occupiedBottom, separatorHeight, maxRows, {
    physicalBottom,
  });
}

function projectFootnoteArea(
  notes,
  policy,
  column,
  occupiedBottom,
  separatorHeight,
  maxRows,
  trial,
) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (
    !Array.isArray(notes) ||
    !notes.length ||
    policy?.state !== 'selected' ||
    policy.kind !== 'footnote' ||
    !column ||
    ![
      column.x,
      column.y,
      column.width,
      column.height,
      column.x + column.width,
      column.y + column.height,
      occupiedBottom,
      separatorHeight,
    ].every(Number.isFinite) ||
    column.width <= 0 ||
    column.height <= 0 ||
    occupiedBottom < column.y ||
    occupiedBottom > column.y + column.height ||
    separatorHeight < 0 ||
    ![policy.aboveLine, policy.belowLine, policy.betweenNotes].every(
      (value) => Number.isFinite(value) && value >= 0,
    ) ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return unavailable('InvalidFootnoteArea');
  if (
    notes.some(
      (note) =>
        note?.kind !== 'footnote' ||
        note.section !== policy.section ||
        !Array.isArray(note.rows) ||
        !Number.isFinite(note.height) ||
        note.height <= 0 ||
        note.width !== column.width,
    )
  )
    return unavailable('InvalidFootnoteArea');
  const height =
    policy.aboveLine +
    separatorHeight +
    policy.belowLine +
    notes.reduce((sum, note) => sum + note.height, 0) +
    policy.betweenNotes * (notes.length - 1);
  if (!Number.isFinite(height)) return unavailable('InvalidFootnoteArea');
  const top = policy.beneathText ? occupiedBottom : column.y + column.height - height;
  if (top < occupiedBottom || top + height > column.y + column.height)
    return unavailable('FootnoteAreaOverflow');
  const rows = [],
    boxes = [],
    numberPrefixes = [],
    flowPictures = [],
    owners = new Set();
  // 수치 계산은 양 경로가 공유하고, trial만 재사용 scratch와 개수로 출력 생성을 생략합니다.
  const rowScratch = trial ? { x: 0, y: 0 } : null,
    clipScratch = trial ? { x: 0, y: 0 } : null;
  let rowCount = 0,
    boxCount = 0,
    prefixCount = 0,
    rowsFit = true;
  let cursor = top + policy.aboveLine + separatorHeight + policy.belowLine;
  for (const note of notes) {
    if (owners.has(note.noteNode)) return unavailable('AmbiguousFootnoteArea');
    owners.add(note.noteNode);
    for (const row of note.rows) {
      if ((trial ? rowCount + prefixCount : rows.length + numberPrefixes.length) >= maxRows)
        return unavailable('FootnoteAreaLimit');
      if (
        !row ||
        ![row.y, row.height, row.x ?? 0].every(Number.isFinite) ||
        row.y < 0 ||
        row.height <= 0 ||
        row.y + row.height > note.height
      )
        return unavailable('InvalidFootnoteArea');
      // generic spread의 getter 관측은 기존 순서를 유지합니다. x/y는 항상 own data입니다.
      const projected = trial ? rowScratch : { ...row, x: 0, y: 0 };
      projected.x = column.x + (row.x ?? 0);
      projected.y = cursor + row.y;
      if (row.pageClip) {
        const pageClip = trial ? clipScratch : { ...row.pageClip, x: 0, y: 0 };
        pageClip.x = column.x + row.pageClip.x;
        pageClip.y = cursor + row.pageClip.y;
        if (!trial)
          defineDataProperty(projected, 'pageClip', {
            value: pageClip,
            enumerable: true,
            configurable: true,
            writable: true,
          });
      }
      if (![projected.x, projected.y, projected.y + row.height].every(Number.isFinite))
        return unavailable('InvalidFootnoteArea');
      if (trial) {
        rowCount++;
        // bounds 실패로 조기 반환하면 뒤의 원 구조 오류를 가리므로 결과만 누적합니다.
        if (rowsFit)
          rowsFit =
            projected.y >= occupiedBottom && projected.y + row.height <= trial.physicalBottom;
      } else rows.push(projected);
    }
    for (const [key, output] of [
      ['boxes', boxes],
      ['numberPrefixes', numberPrefixes],
    ]) {
      if (note[key] !== undefined && !Array.isArray(note[key]))
        return unavailable('InvalidFootnoteArea');
      for (const item of note[key] ?? []) {
        if (key === 'boxes' && (trial ? boxCount : boxes.length) >= maxRows)
          return unavailable('FootnoteAreaLimit');
        if (
          (trial ? rowCount + prefixCount : rows.length + numberPrefixes.length) >= maxRows &&
          key === 'numberPrefixes'
        )
          return unavailable('FootnoteAreaLimit');
        if (
          !item ||
          ![item.x, item.y, item.height, item.x + (item.width ?? 0), item.y + item.height].every(
            Number.isFinite,
          ) ||
          item.y < 0 ||
          item.height <= 0 ||
          item.y + item.height > note.height ||
          (key === 'boxes' &&
            (!Number.isFinite(item.width) ||
              item.width <= 0 ||
              item.x < 0 ||
              item.x + item.width > column.width + 1e-8))
        )
          return unavailable('InvalidFootnoteArea');
        const projected = trial ? rowScratch : { ...item, x: 0, y: 0 };
        projected.x = column.x + item.x;
        projected.y = cursor + item.y;
        if (trial) {
          if (key === 'boxes') boxCount++;
          else prefixCount++;
        } else output.push(projected);
      }
    }
    const pictures = projectNoteFlowPictures(note.flowPictures ?? [], column.x, cursor, {}, note);
    if (pictures.state !== 'projected') return pictures;
    flowPictures.push(...pictures.pictures);
    cursor += note.height + policy.betweenNotes;
  }
  if (trial) return { state: 'placed', rowsFit };
  return {
    state: 'placed',
    rows,
    boxes,
    numberPrefixes,
    flowPictures,
    area: { x: column.x, y: top, width: column.width, height },
    separatorY: top + policy.aboveLine,
    bodyBottom: top,
    spatialRows: true,
  };
}
