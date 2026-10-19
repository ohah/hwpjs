import { intersectPictureLineRegions } from "./picture-line-intersections.mjs";

// 배치가 끝난 표의 전체 footprint를 검사합니다. 겹침을 좌표 이동으로 숨기지 않습니다.
export function checkTablePictureReservations(footprints, reservations) {
  const fail = error => ({ state: "unavailable", error });
  if (!Array.isArray(footprints) || !Array.isArray(reservations)) return fail("InvalidTablePictureReservations");
  const identity = item => item && Number.isSafeInteger(item.section) && item.section >= 0
    && Number.isSafeInteger(item.pageOrdinal) && item.pageOrdinal >= 0;
  if (reservations.some(item => !identity(item))) return fail("InvalidTablePictureReservations");
  for (const footprint of footprints) {
    if (!identity(footprint)) return fail("InvalidTablePictureReservations");
    const rectangle = footprint.rectangle;
    const selected = reservations.filter(item => item.section === footprint.section && item.pageOrdinal === footprint.pageOrdinal);
    const result = intersectPictureLineRegions(rectangle, selected);
    if (result.state !== "available") return fail("InvalidTablePictureReservationBounds");
    if (!result.regions.some(region => region.x <= rectangle.x && region.x + region.width >= rectangle.x + rectangle.width)) {
      return { ...fail("TablePictureReservationOverlap"), section: footprint.section, tableNode: footprint.tableNode, pageOrdinal: footprint.pageOrdinal };
    }
  }
  return { state: "clear" };
}
