import { isFootnoteColumnReservation } from "./footnote-column-reservation.mjs";
import { pageSequenceReference } from "./page-sequence-reference.mjs";

// Factory-owned reservations inspect only already placed body references for
// a CELL gap. Future table pages have no new body references in that prefix.
export function footnoteCellPageCapacities(setting, host, prefixRows, columnBottom, {
  firstPage = 0, prefixHeight = 0, occupiedBottom, maxPages = 2000, x = 20, y = 20, gap = 20,
} = {}) {
  const fail = error => ({ state: "unavailable", error });
  if (!isFootnoteColumnReservation(columnBottom) || !Array.isArray(prefixRows)
    || !Number.isSafeInteger(firstPage) || firstPage < 0 || !Number.isSafeInteger(maxPages) || maxPages < 1
    || !Number.isFinite(prefixHeight) || prefixHeight < 0 || !Number.isSafeInteger(host?.section) || host.section < 0
    || !Number.isSafeInteger(host?.paragraph) || host.paragraph < 0
    || prefixRows.some(row => !row || row.section !== host.section || !Number.isSafeInteger(row.pageOrdinal)
      || row.pageOrdinal < 0 || row.pageOrdinal > firstPage || row.columnOrdinal !== 0)) return fail("InvalidFootnoteCellCapacitySources");
  if (firstPage >= maxPages) return fail("TableCellPageLimit");
  const reference = pageSequenceReference(setting, firstPage, { x, y, gap });
  if (reference.state !== "placed") return reference;
  const column = reference.boxes.page, occupied = occupiedBottom ?? column.y;
  if (!Number.isFinite(occupied) || occupied < column.y || occupied > column.y + column.height) return fail("InvalidFootnoteCellCapacitySources");
  const bottom = columnBottom({ kind: "gap", section: host.section, paragraph: host.paragraph, height: 0 },
    { column, pageOrdinal: firstPage, columnOrdinal: 0, placedRows: prefixRows });
  if (!Number.isFinite(bottom) || bottom < column.y || bottom > column.y + column.height) return fail("InvalidPageColumnBottom");
  const capacity = column.height - prefixHeight;
  if (capacity <= 0) return fail("RepeatedHeaderTooTall");
  const pageCapacities = Array(maxPages - firstPage).fill(capacity);
  pageCapacities[0] = Math.max(0, bottom - column.y - prefixHeight);
  return { state: "planned", pageCapacities,
    firstCapacity: Math.max(0, Math.min(capacity, bottom - occupied - prefixHeight)) };
}
