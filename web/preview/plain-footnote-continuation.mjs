import { placeFootnoteArea } from './footnote-area-placement.mjs';
import { columnReferenceBoxes } from './column-reference-boxes.mjs';
import { footnoteTextReference } from './footnote-reference-rows.mjs';
import { createFootnoteColumnReservation } from './footnote-column-reservation.mjs';
import { paginateBodyRows } from './page-row-flow.mjs';
import { pageSequenceReference } from './page-sequence-reference.mjs';
import { pageRowRequiredHeight } from './page-row-extents.mjs';

// 긴 plain 각주의 전체 행을 한 번씩 소비합니다. 측정/번호/표시 authority는 기존 모듈입니다.
export function paginatePlainFootnoteContinuations(
  rows,
  setting,
  flows,
  notes,
  policy,
  separatorHeight,
  { maxRows = 20000, maxPages = 2000, maxPasses = 4000 } = {},
) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (![maxRows, maxPages, maxPasses].every((n) => Number.isSafeInteger(n) && n > 0))
    return fail('InvalidFootnoteContinuationBounds');
  if (!Array.isArray(rows) || !Array.isArray(notes) || !notes.length || !Array.isArray(flows))
    return fail('UnsupportedFootnoteContinuationColumns');
  const canonical = createFootnoteColumnReservation(notes, policy, separatorHeight);
  if (canonical.state !== 'ready') return canonical;
  const first = pageSequenceReference(setting, 0);
  if (first.state !== 'placed') return fail('InvalidFootnoteContinuationPage');
  const fullColumn = (declaration) => {
    if (declaration == null) return true;
    const result = columnReferenceBoxes(first.boxes.page, declaration);
    return (
      result.state === 'placed' &&
      result.boxes.length === 1 &&
      ['x', 'y', 'width', 'height'].every((key) => result.boxes[0][key] === first.boxes.page[key])
    );
  };
  for (const flow of flows) {
    if (
      !fullColumn(flow.column_start_declaration) ||
      !fullColumn(flow.column_declaration) ||
      (flow.column_changes !== undefined && !Array.isArray(flow.column_changes)) ||
      (flow.column_changes ?? []).some(
        (change) =>
          !Number.isSafeInteger(change?.unit) || change.unit < 0 || !fullColumn(change.declaration),
      )
    )
      return fail('UnsupportedFootnoteContinuationColumns');
  }
  const counters = {
    sourceRowVisits: 0,
    sourceAnchorVisits: 0,
    physicalRowVisits: 0,
    physicalBuilds: 0,
  };
  const height = first.boxes.page.height;
  const overhead = policy.aboveLine + separatorHeight + policy.belowLine;
  if (![overhead, policy.betweenNotes].every((n) => Number.isFinite(n) && n >= 0))
    return fail('InvalidFootnoteContinuationPolicy');
  // 올림은 허용오차가 아니라 실제 예약 공간입니다. 기존 배치 검사는 그대로 둡니다.
  const representation = new DataView(new ArrayBuffer(8));
  const nextUp = (value) => {
    representation.setFloat64(0, value);
    representation.setBigUint64(0, representation.getBigUint64(0) + 1n);
    return representation.getFloat64(0);
  };
  const seen = new Set();
  for (const note of notes) {
    if (seen.has(note.noteNode)) return fail('AmbiguousFootnoteContinuationOwner');
    seen.add(note.noteNode);
    if (
      note.atomicScene ||
      ['boxes', 'flowPictures', 'numberPrefixes'].some((k) => note[k]?.length) ||
      !Array.isArray(note.rows) ||
      !note.rows.length ||
      note.width !== first.boxes.page.width ||
      !Number.isFinite(note.height) ||
      note.height <= 0
    )
      return fail('UnsupportedFootnoteContinuationContent');
    let end = 0;
    for (const row of note.rows) {
      if (
        !['text', 'gap'].includes(row?.kind) ||
        !Number.isFinite(row.y) ||
        row.y < end ||
        !Number.isFinite(row.height) ||
        row.height <= 0 ||
        row.y + row.height > note.height ||
        row.transform !== undefined ||
        row.pageClip !== undefined ||
        (row.keepNextHeight ?? 0) !== 0
      )
        return fail('UnsupportedFootnoteContinuationRows');
      end = row.y + row.height;
    }
  }
  // 같은 text-row 판정 SSOT를 기존 일반 예약기와 공유합니다.
  // 문서 스냅샷 내 소유 source 좌표를 색인하며 공개 reference를 발급하지 않습니다.
  const anchorIndex = new Map(),
    groups = new Map(),
    rowKey = (row) => `${row.section}:${row.paragraph}:${row.startUnit}:${row.endUnit}`;
  const hostKey = (section, paragraph) => `${section}:${paragraph}`;
  for (const note of notes) {
    const key = hostKey(note.section, note.hostParagraph);
    if (!groups.has(key)) groups.set(key, { notes: [], rows: [] });
    groups.get(key).notes.push(note);
  }
  for (let i = 0; i < rows.length; i++) {
    counters.sourceRowVisits++;
    if (rows[i]?.kind === 'text')
      groups
        .get(hostKey(rows[i].section, rows[i].paragraph))
        ?.rows.push({ row: rows[i], index: i });
  }
  for (const group of groups.values()) {
    group.notes.sort((a, b) => a.anchorUnit - b.anchorUnit);
    let cursor = 0,
      end = -1;
    for (const item of group.rows) {
      const row = item.row;
      if (
        !Number.isSafeInteger(row.startUnit) ||
        !Number.isSafeInteger(row.endUnit) ||
        row.startUnit < end ||
        row.endUnit < row.startUnit
      )
        return fail('AmbiguousFootnoteContinuationReference');
      end = row.endUnit;
      while (cursor < group.notes.length && group.notes[cursor].anchorUnit < row.endUnit) {
        const note = group.notes[cursor++];
        counters.sourceAnchorVisits++;
        if (!footnoteTextReference(row, note)) return fail('MissingFootnoteContinuationReference');
        anchorIndex.set(note, item.index);
      }
    }
  }
  if (anchorIndex.size !== notes.length) return fail('MissingFootnoteContinuationReference');
  const ordered = notes.toSorted(
    (a, b) => anchorIndex.get(a) - anchorIndex.get(b) || a.anchorUnit - b.anchorUnit,
  );
  const anchorKeys = new Set(ordered.map((note) => rowKey(rows[anchorIndex.get(note)])));
  let physicalIndex = new Map();
  const indexPhysical = (page) => {
    physicalIndex = new Map();
    counters.physicalBuilds++;
    for (const row of page.rows) {
      counters.physicalRowVisits++;
      if (row.kind !== 'text') continue;
      const key = rowKey(row);
      if (anchorKeys.has(key)) physicalIndex.set(key, physicalIndex.has(key) ? null : row);
    }
  };
  const allocations = new Map(),
    minimum = new Map(),
    locked = new Map();
  let passes = 0,
    last;
  const reserved = (ordinal) => {
    const fragments = allocations.get(ordinal) ?? [];
    return fragments.length
      ? overhead +
          fragments.reduce((n, f) => n + f.height, 0) +
          policy.betweenNotes * (fragments.length - 1)
      : 0;
  };
  const paginate = () => {
    while (++passes <= maxPasses) {
      last = null;
      const result = paginateBodyRows(rows, setting, flows, {
        maxRows,
        maxPages,
        minimumRowPage: (row) => minimum.get(row) ?? 0,
        columnBottom: (row, context) => {
          last = { row, ordinal: context.pageOrdinal };
          return context.column.y + context.column.height - reserved(context.pageOrdinal);
        },
      });
      if (result.state === 'paginated') {
        indexPhysical(result);
        return result;
      }
      if (
        result.error !== 'PageColumnReservationOverflow' ||
        !last ||
        reserved(last.ordinal) === 0 ||
        last.ordinal + 1 >= maxPages
      )
        return result;
      const next = last.ordinal + 1;
      if (next <= (minimum.get(last.row) ?? 0)) return fail('FootnoteContinuationNoProgress');
      minimum.set(last.row, next);
    }
    return fail('FootnoteContinuationReflowLimit');
  };
  let page = paginate();
  if (page.state !== 'paginated' || page.limited) return page;
  const physicalAnchor = (note) => {
    const row = physicalIndex.get(rowKey(rows[anchorIndex.get(note)]));
    return footnoteTextReference(row, note) ? row : null;
  };
  for (const note of ordered) {
    const anchor = physicalAnchor(note);
    if (!anchor) return fail('MissingFootnoteContinuationReference');
    const required = pageRowRequiredHeight(anchor, anchor.keepNextHeight ?? 0);
    if (required === null) return fail('UnsupportedFootnoteContinuationAnchor');
    locked.set(note, { ordinal: anchor.pageOrdinal, y: anchor.y });
    let ordinal = anchor.pageOrdinal,
      start = 0;
    while (start < note.rows.length) {
      if (ordinal >= maxPages) return fail('FootnoteContinuationPageLimit');
      const frame = pageSequenceReference(setting, ordinal);
      if (frame.state !== 'placed') return fail('InvalidFootnoteContinuationPage');
      const existing = allocations.get(ordinal) ?? [];
      const bodyHeight =
        ordinal === anchor.pageOrdinal ? anchor.y + required - frame.boxes.page.y : 0;
      const capacity =
        height -
        bodyHeight -
        reserved(ordinal) -
        (existing.length ? policy.betweenNotes : overhead);
      const base = start === 0 ? 0 : note.rows[start].y;
      let end = start,
        fragmentHeight = 0;
      while (end < note.rows.length) {
        const boundary = end + 1 === note.rows.length ? note.height : note.rows[end + 1].y;
        // 같은 실제 투영 연산의 높이를 예약합니다. epsilon/행 클리핑으로 거부를 풀지 않습니다.
        const normalizedBottom = note.rows[end].y - base + note.rows[end].height;
        const candidateHeight = Math.max(fragmentHeight, boundary - base, normalizedBottom);
        if (candidateHeight > capacity) break;
        fragmentHeight = candidateHeight;
        end++;
      }
      let fragment = null;
      const physicalBottom = frame.boxes.page.y + frame.boxes.page.height;
      const physicalStep = nextUp(physicalBottom) - physicalBottom;
      // 부동소수 재기준·물리 좌표 덧셈의 실제 결과를 같은 배치기로 확인합니다.
      // 공간을 정확히 예약할 수 없으면 마지막 행을 다음 쪽으로 보냅니다.
      while (end > start && fragment === null) {
        const boundary = end === note.rows.length ? note.height : note.rows[end].y;
        const fragmentRows = note.rows
          .slice(start, end)
          .map((row) => ({ ...row, y: row.y - base }));
        let measuredHeight = Math.max(
          boundary - base,
          ...fragmentRows.map((row) => row.y + row.height),
        );
        for (let adjustment = 0; adjustment < 8 && measuredHeight <= capacity; adjustment++) {
          const candidate = {
            ...note,
            height: measuredHeight,
            rows: fragmentRows,
            continuation: start > 0,
            fragmentStart: start,
            fragmentEnd: end,
          };
          const trial = placeFootnoteArea(
            [...existing, candidate],
            { ...policy, beneathText: false },
            frame.boxes.page,
            frame.boxes.page.y + bodyHeight,
            separatorHeight,
          );
          if (
            trial.state === 'placed' &&
            trial.rows.every(
              (row) =>
                row.y >= frame.boxes.page.y + bodyHeight && row.y + row.height <= physicalBottom,
            )
          ) {
            fragment = candidate;
            break;
          }
          if (
            trial.state !== 'placed' &&
            !['InvalidFootnoteArea', 'FootnoteAreaOverflow'].includes(trial.error)
          )
            return trial;
          measuredHeight = nextUp(measuredHeight + physicalStep);
        }
        if (fragment === null) end--;
      }
      if (fragment === null) {
        if (!existing.length && bodyHeight === 0) return fail('FootnoteContinuationRowOverflow');
        ordinal++;
        continue;
      }
      allocations.set(ordinal, [...existing, fragment]);
      start = end;
      ordinal++;
    }
    page = paginate();
    if (page.state !== 'paginated' || page.limited) return page;
    for (const [prior, position] of locked) {
      const current = physicalAnchor(prior);
      if (!current || current.pageOrdinal !== position.ordinal || current.y !== position.y)
        return fail('FootnoteContinuationAnchorMoved');
    }
  }
  const lastPage = Math.max(...allocations.keys());
  const pages = [...page.pages];
  while (pages.length <= lastPage) {
    const ordinal = pages.length,
      frame = pageSequenceReference(setting, ordinal);
    if (frame.state !== 'placed') return fail('InvalidFootnoteContinuationPage');
    pages.push({ ordinal, ...frame.boxes, columns: [frame.boxes.page] });
  }
  return {
    state: 'ready',
    page: { ...page, pages },
    passes,
    counters,
    notesFor: (_rows, ordinal, column) => (column === 0 ? (allocations.get(ordinal) ?? []) : []),
  };
}
