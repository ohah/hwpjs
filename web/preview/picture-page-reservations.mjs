import { projectFloatingPicturePage } from "./picture-page-projection.mjs";
import { intersectPictureLineRegions } from "./picture-line-intersections.mjs";
import { layoutPictureCaption } from "./picture-caption-layout.mjs";

// 배치와 줄 공간 계산은 기존 모듈이 소유합니다. 여기서는 페이지 소속만 연결합니다.
export function picturePageReservations(pictures, paragraphs, rows, { captionMeasure, captionParagraphs = paragraphs, maxCaptionRows = 20000, ...options } = {}) {
  if (!Array.isArray(pictures)) return { state: "unavailable", error: "InvalidPicturePageReservations" };
  if (!Number.isSafeInteger(maxCaptionRows) || maxCaptionRows < 1) return { state: "unavailable", error: "InvalidPictureCaptionBudget" };
  const reservations = [], captionRows = [], ids = new Set();
  for (const picture of pictures) {
    const key = `${picture.section}:${picture.pictureNode}`;
    if (ids.has(key)) return { state: "unavailable", error: "AmbiguousPicturePageReservations" };
    ids.add(key);
    if (![0, 1].includes(picture.flow?.textWrap)) return { state: "unavailable", error: "UnsupportedPicturePageReservationWrap" };
    const result = projectFloatingPicturePage(picture, paragraphs, rows, options);
    if (result.state !== "placed") return result;
    const reservation = { pictureNode: picture.pictureNode, section: picture.section, pageOrdinal: result.pageOrdinal,
      rectangle: result.rectangle, flow: picture.flow };
    if (picture.caption != null) {
      if (typeof captionMeasure !== "function") return { state: "unavailable", error: "MissingPictureCaptionMeasurement" };
      if (captionRows.length >= maxCaptionRows) return { state: "unavailable", error: "PictureCaptionRowLimit" };
      const caption = layoutPictureCaption(picture, captionParagraphs, result.rectangle, captionMeasure, { maxRows: maxCaptionRows - captionRows.length });
      if (caption.state !== "positioned") return caption;
      reservation.flowRectangle = caption.bounds;
      reservation.captionRectangle = caption.captionRectangle;
      captionRows.push(...caption.rows.map(row => ({ ...row, pageOrdinal: result.pageOrdinal, referenceBoxes: result.referenceBoxes })));
    }
    reservations.push(reservation);
  }
  return { state: "reserved", reservations, ...(captionRows.length ? { captionRows } : {}) };
}

export function picturePageLineRegions(line, pageOrdinal, reservations) {
  if (!Number.isSafeInteger(pageOrdinal) || pageOrdinal < 0 || !Array.isArray(reservations)) return { state: "invalid_page_reservations" };
  return intersectPictureLineRegions(line, reservations.filter(item => item.pageOrdinal === pageOrdinal), { includeNextEvent: true });
}
