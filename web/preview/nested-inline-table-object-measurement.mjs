import { reserveTableCaptionSpace } from "./table-caption-page-reservation.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

/** Table cells and caption share one measured inline footprint and row budget. */
export function measureNestedInlineTableObject(table, measured, paragraphs, measure, maxRows) {
  const fail = error => ({ state: "unavailable", error });
  if (table?.sourceGeometry?.geometry?.treat_as_character !== true || measured?.state !== "measured"
    || ![measured.grid?.width, measured.grid?.height].every(v => Number.isFinite(v) && v > 0)
    || !Number.isSafeInteger(measured.rowCount) || measured.rowCount < 0
    || !Number.isSafeInteger(maxRows) || maxRows < 1 || measured.rowCount > maxRows) return fail("InvalidNestedInlineTableMeasurement");
  const raw = table.sourceGeometry.out_margin;
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every(v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff)) return fail("MissingTableOuterInsets");
  const [left, right, top, bottom] = raw.map(hwpUnitPixels);
  let outerInsets = { left, right, top, bottom }, captionReservation;
  if (table.sourceCaption) {
    if (measured.rowCount === maxRows) return fail("TableCaptionMeasurementLimit");
    captionReservation = reserveTableCaptionSpace(table, paragraphs, { x: 0, y: 0, width: measured.grid.width, height: measured.grid.height },
      measure, outerInsets, { maxRows: maxRows - measured.rowCount });
    if (captionReservation.state !== "reserved") return captionReservation;
    captionReservation = { ...captionReservation, owner: { section: table.section, tableNode: table.tableNode,
      captionNode: table.sourceCaption.caption_node, listNode: table.sourceCaption.list_node } };
    outerInsets = captionReservation.outerInsets;
  }
  const width = measured.grid.width + outerInsets.left + outerInsets.right;
  const height = measured.grid.height + outerInsets.top + outerInsets.bottom;
  if (![width, height].every(v => Number.isFinite(v) && v > 0)) return fail("InvalidNestedInlineTableMeasurement");
  return { state: "object-measured", width, height, outerInsets, captionReservation,
    rowCount: measured.rowCount + (captionReservation?.rowCount ?? 0) };
}
