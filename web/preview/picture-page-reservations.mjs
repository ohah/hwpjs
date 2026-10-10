import { projectFloatingPicturePage } from "./picture-page-projection.mjs";
import { intersectPictureLineRegions } from "./picture-line-intersections.mjs";

// 배치와 줄 공간 계산은 기존 모듈이 소유합니다. 여기서는 페이지 소속만 연결합니다.
export function picturePageReservations(pictures, paragraphs, rows, options) {
  if (!Array.isArray(pictures)) return { state: "unavailable", error: "InvalidPicturePageReservations" };
  const reservations = [], ids = new Set();
  for (const picture of pictures) {
    const key = `${picture.section}:${picture.pictureNode}`;
    if (ids.has(key)) return { state: "unavailable", error: "AmbiguousPicturePageReservations" };
    ids.add(key);
    if (![0, 1].includes(picture.flow?.textWrap)) return { state: "unavailable", error: "UnsupportedPicturePageReservationWrap" };
    const result = projectFloatingPicturePage(picture, paragraphs, rows, options);
    if (result.state !== "placed") return result;
    reservations.push({ pictureNode: picture.pictureNode, section: picture.section, pageOrdinal: result.pageOrdinal,
      rectangle: result.rectangle, flow: picture.flow });
  }
  return { state: "reserved", reservations };
}

export function picturePageLineRegions(line, pageOrdinal, reservations) {
  if (!Number.isSafeInteger(pageOrdinal) || pageOrdinal < 0 || !Array.isArray(reservations)) return { state: "invalid_page_reservations" };
  return intersectPictureLineRegions(line, reservations.filter(item => item.pageOrdinal === pageOrdinal), { includeNextEvent: true });
}
