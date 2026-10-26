import { tableBodyIntersection } from './table-body-intersection.mjs';

/** Advance only colliding body rows; table footprints remain in physical coordinates. */
export function reservePaperTableRow(row, context, reservations) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    !Number.isFinite(row?.height) ||
    row.height <= 0 ||
    !Number.isFinite(context?.y) ||
    !Number.isSafeInteger(context?.pageOrdinal) ||
    context.pageOrdinal < 0 ||
    !Array.isArray(reservations)
  )
    return fail('InvalidPaperTableReservation');
  const column = context.column;
  if (
    !column ||
    tableBodyIntersection(column, column).state !== 'intersecting' ||
    context.y < column.y ||
    !Number.isFinite(context.y + row.height)
  )
    return fail('InvalidPaperTableReservation');
  for (const item of reservations)
    if (
      !Number.isSafeInteger(item?.pageOrdinal) ||
      item.pageOrdinal < 0 ||
      tableBodyIntersection(item.footprint, column).state === 'unavailable'
    )
      return fail('InvalidPaperTableReservation');
  let y = context.y;
  for (let attempt = 0; attempt <= reservations.length; attempt++) {
    let next = y;
    const line = { x: column.x, y, width: column.width, height: row.height };
    for (const item of reservations) {
      if (item.pageOrdinal !== context.pageOrdinal) continue;
      const overlap = tableBodyIntersection(item.footprint, line);
      if (overlap.state === 'unavailable') return fail('InvalidPaperTableReservation');
      if (overlap.state === 'intersecting')
        next = Math.max(next, item.footprint.y + item.footprint.height);
    }
    if (next === y) return { state: 'reserved', y };
    y = next;
  }
  return fail('PaperTableReservationLimit');
}
