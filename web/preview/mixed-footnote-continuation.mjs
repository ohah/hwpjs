import { pageVisibleRectangle, pageContainsPoint } from './page-visible-rectangle.mjs';
import { createdTableIdentity } from '../../js/created-table-identity.mjs';
import { plainFootnoteUnitsAdapter } from './plain-footnote-units-adapter.mjs';
import { paginateFootnoteContinuationUnits } from './footnote-continuation-engine.mjs';
const fail = (error) => ({ state: 'unavailable', error });
const finite = (value) => Number.isFinite(value);
const cellKey = (cell) => `${cell.identity}:${cell.row}:${cell.column}`;
// 0폭은 숨은 사각형일 수 있지만 불명·음수·범위 밖 geometry와 구분합니다.
const containedRectangle = (rectangle, bounds) =>
  pageVisibleRectangle(rectangle, bounds).state !== 'invalid_page_clip' &&
  pageContainsPoint(bounds, rectangle.x, rectangle.y) &&
  pageContainsPoint(bounds, rectangle.x + rectangle.width, rectangle.y + rectangle.height);

// 측정된 표시 geometry만 다루며 Native 참조를 발급하지 않습니다.
export function prepareMixedFootnoteContinuation(
  notes,
  page,
  policy,
  separatorHeight,
  { maxRows = 20000 } = {},
) {
  const candidates = notes.filter((note) => note.continuationUnits !== undefined);
  if (!candidates.length) return null;
  if (candidates.length !== 1) return null;
  const note = candidates[0];
  if (
    note.kind !== 'footnote' ||
    note.atomicScene ||
    note.flowPictures?.length ||
    !Array.isArray(note.boxes) ||
    !note.boxes.length
  )
    return null;
  if (notes.some((n) => n !== note && plainFootnoteUnitsAdapter.validate(n, page.width)))
    return null;
  if (
    !Array.isArray(note.rows) ||
    !Array.isArray(note.numberPrefixes) ||
    !Array.isArray(note.continuationUnits) ||
    !note.continuationUnits.length ||
    note.continuationUnits.length > maxRows
  )
    return fail('InvalidMixedFootnoteContinuationUnits');
  if (note.width !== page.width || !finite(note.height) || note.height <= 0)
    return fail('InvalidMixedFootnoteContinuationUnits');
  const rowsSeen = new Set(),
    boxesSeen = new Set(),
    prefixSeen = new Set(),
    tableUnits = [];
  const counters = {
    unitVisits: 0,
    rowAssignments: 0,
    boxAssignments: 0,
    prefixAssignments: 0,
    materializedRows: 0,
    materializedBoxes: 0,
  };
  const units = note.continuationUnits;
  let bottom = 0;
  for (const unit of units) {
    counters.unitVisits++;
    if (
      !unit ||
      ![unit.y, unit.height].every(finite) ||
      unit.y < bottom ||
      unit.height <= 0 ||
      unit.y + unit.height > note.height
    )
      return fail('InvalidMixedFootnoteContinuationUnits');
    bottom = unit.y + unit.height;
    for (const [key, array, seen, count] of [
      ['rowIndices', note.rows, rowsSeen, 'rowAssignments'],
      ['boxIndices', note.boxes, boxesSeen, 'boxAssignments'],
      ['prefixIndices', note.numberPrefixes, prefixSeen, 'prefixAssignments'],
    ]) {
      if (!Array.isArray(unit[key])) return fail('InvalidMixedFootnoteContinuationUnits');
      for (const index of unit[key]) {
        counters[count]++;
        if (!Number.isSafeInteger(index) || index < 0 || index >= array.length || seen.has(index))
          return fail('AmbiguousMixedFootnoteContinuationPart');
        seen.add(index);
        const item = array[index];
        if (
          !item ||
          ![item.y, item.height].every(finite) ||
          item.height <= 0 ||
          item.y < unit.y ||
          item.y + item.height > bottom
        )
          return fail('MixedFootnotePartOutsideUnit');
      }
    }
    if (unit.tableIdentity !== undefined || unit.sourceTableNode !== undefined)
      tableUnits.push(unit);
    else if (
      unit.boxIndices.length ||
      unit.rowIndices.some((i) => note.rows[i].createdCell || note.rows[i].tableNode !== undefined)
    )
      return fail('MissingMixedFootnoteTableBlock');
  }
  if (
    rowsSeen.size !== note.rows.length ||
    boxesSeen.size !== note.boxes.length ||
    prefixSeen.size !== note.numberPrefixes.length
  )
    return fail('IncompleteMixedFootnoteContinuationParts');
  if (tableUnits.length !== 1) return null;
  const table = tableUnits[0];
  const source = table.sourceTableNode !== undefined;
  if (source) {
    if (
      table.tableIdentity !== undefined ||
      !Number.isSafeInteger(table.sourceTableNode) ||
      table.sourceTableNode < 0 ||
      !Array.isArray(table.sourceCells) ||
      !table.sourceCells.length
    )
      return fail('InvalidMixedFootnoteTableIdentity');
  } else {
    try {
      createdTableIdentity(table.tableIdentity);
    } catch {
      return fail('InvalidMixedFootnoteTableIdentity');
    }
  }
  const sourceCells = new Set();
  if (source)
    for (const cell of table.sourceCells) {
      if (
        !Number.isSafeInteger(cell.listNode) ||
        cell.listNode < 0 ||
        cell.rowSpan !== 1 ||
        cell.columnSpan !== 1 ||
        sourceCells.has(cell.listNode)
      )
        return fail('InvalidMixedFootnoteCellOwner');
      sourceCells.add(cell.listNode);
    }
  const keyOf = (item) =>
    source
      ? `source:${item.section}:${item.tableNode}:${item.listNode}`
      : cellKey(item.createdCell);
  const bounds = table.tableBounds;
  const noteBounds = { x: 0, y: 0, width: note.width, height: note.height };
  if (
    !bounds ||
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(finite) ||
    bounds.x < 0 ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    bounds.x + bounds.width > note.width ||
    bounds.y < table.y ||
    bounds.y + bounds.height > table.y + table.height
  )
    return fail('InvalidMixedFootnoteTableBounds');
  const overhead = policy.aboveLine + separatorHeight + policy.belowLine;
  if (table.height + overhead > page.height) return fail('CreatedNotePageHeightOverflow');
  const cells = new Map();
  for (const i of table.boxIndices) {
    const box = note.boxes[i],
      cell = box.createdCell;
    if (source) {
      if (
        cell ||
        box.section !== note.section ||
        box.tableNode !== table.sourceTableNode ||
        !sourceCells.has(box.listNode) ||
        cells.has(keyOf(box))
      )
        return fail('InvalidMixedFootnoteCellOwner');
    } else if (
      !cell ||
      cell.identity !== table.tableIdentity ||
      !Number.isSafeInteger(cell.row) ||
      cell.row < 0 ||
      !Number.isSafeInteger(cell.column) ||
      cell.column < 0 ||
      (box.rowSpan ?? 1) !== 1 ||
      (box.columnSpan ?? 1) !== 1 ||
      cells.has(keyOf(box))
    )
      return fail('InvalidMixedFootnoteCellOwner');
    if (!containedRectangle(box, bounds) || box.width <= 0 || box.height <= 0)
      return fail('InvalidMixedFootnoteTableBounds');
    cells.set(keyOf(box), box);
  }
  if (!cells.size || (source && cells.size !== sourceCells.size))
    return fail('MissingMixedFootnoteCellOwner');
  const fullClip = (clip) =>
    clip &&
    clip.x === 0 &&
    clip.y === 0 &&
    clip.width === note.width &&
    clip.height === note.height;
  for (const row of note.rows) {
    if ((row.keepNextHeight ?? 0) !== 0) return fail('UnsupportedFootnoteContinuationRows');
    const rectangle = {
      x: row.kind === 'gap' ? (row.x ?? 0) : row.x,
      y: row.y,
      width: row.kind === 'gap' ? (row.width ?? 0) : row.width,
      height: row.height,
    };
    // 비셀 host의 nominal 폭은 원 측정값을 유지합니다. 셀만 실제 사각형 전체를 검사합니다.
    if (
      pageVisibleRectangle(rectangle, noteBounds).state === 'invalid_page_clip' ||
      !pageContainsPoint(noteBounds, rectangle.x, rectangle.y) ||
      !pageContainsPoint(noteBounds, rectangle.x, rectangle.y + rectangle.height) ||
      rectangle.width > note.width
    )
      return fail('InvalidMixedFootnoteRowGeometry');
    if (
      !['text', 'gap'].includes(row.kind) ||
      row.noteNode !== note.noteNode ||
      row.noteKind !== 'footnote' ||
      row.transform !== undefined
    )
      return fail('UnsupportedMixedFootnoteRow');
    if (source && row.tableNode !== undefined) {
      const box = cells.get(keyOf(row));
      if (
        !box ||
        row.createdCell ||
        row.noteListNode !== note.listNode ||
        row.pageClip !== undefined ||
        !containedRectangle(rectangle, box)
      )
        return fail('InvalidMixedFootnoteCellClip');
    } else if (row.createdCell) {
      if (source) return fail('InvalidMixedFootnoteCellOwner');
      const box = cells.get(keyOf(row));
      if (
        !box ||
        !containedRectangle(rectangle, box) ||
        !row.pageClip ||
        !['x', 'y', 'width', 'height'].every((k) => row.pageClip[k] === box[k])
      )
        return fail('InvalidMixedFootnoteCellClip');
    } else if (row.pageClip !== undefined && !(source && fullClip(row.pageClip)))
      return fail('UnsupportedMixedFootnoteRow');
  }
  for (const prefix of note.numberPrefixes)
    if (!containedRectangle(prefix, noteBounds) || prefix.height <= 0)
      return fail('InvalidMixedFootnotePrefixGeometry');
  if (note.numberPrefixes.some((prefix) => prefix.pageClip !== undefined))
    return fail('UnsupportedMixedFootnotePrefixClip');
  const planRows = units.map((unit) => ({ kind: 'gap', y: unit.y, height: unit.height }));
  const selected = new Map([[note, { units, planRows }]]);
  const adapter = {
    validate(n, width) {
      return selected.has(n)
        ? n.width === width
          ? null
          : 'InvalidMixedFootnoteContinuationUnits'
        : plainFootnoteUnitsAdapter.validate(n, width);
    },
    units(n) {
      return selected.get(n)?.planRows ?? plainFootnoteUnitsAdapter.units(n);
    },
    fragment(n, range) {
      const plan = selected.get(n);
      if (!plan) return plainFootnoteUnitsAdapter.fragment(n, range);
      const { start, end, base, height } = range;
      const rows = [],
        boxes = [],
        numberPrefixes = [];
      for (let i = start; i < end; i++) {
        const unit = plan.units[i];
        for (const index of unit.rowIndices) {
          const row = n.rows[index];
          rows.push({
            ...row,
            y: row.y - base,
            ...(row.pageClip
              ? {
                  pageClip:
                    source && fullClip(row.pageClip)
                      ? { x: 0, y: 0, width: n.width, height }
                      : { ...row.pageClip, y: row.pageClip.y - base },
                }
              : {}),
          });
          counters.materializedRows++;
        }
        for (const index of unit.boxIndices) {
          const box = n.boxes[index];
          boxes.push({ ...box, y: box.y - base });
          counters.materializedBoxes++;
        }
        for (const index of unit.prefixIndices) {
          const prefix = n.numberPrefixes[index];
          numberPrefixes.push({ ...prefix, y: prefix.y - base });
        }
      }
      return {
        ...n,
        height,
        rows,
        boxes,
        numberPrefixes,
        continuation: start > 0,
        fragmentStart: start,
        fragmentEnd: end,
        mixedFragment: true,
      };
    },
  };
  return {
    state: 'prepared',
    canSplit: (n) => selected.has(n),
    counters,
    paginate(rows, setting, flows, allNotes, selectedPolicy, separator, options) {
      const result = paginateFootnoteContinuationUnits(
        rows,
        setting,
        flows,
        allNotes,
        selectedPolicy,
        separator,
        options,
        true,
        adapter,
      );
      return result.state === 'ready' ? { ...result, mixedCounters: counters } : result;
    },
  };
}
