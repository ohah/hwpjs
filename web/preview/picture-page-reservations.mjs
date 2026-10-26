import { projectFloatingPicturePage } from './picture-page-projection.mjs';
import { intersectPictureLineRegions } from './picture-line-intersections.mjs';
import { measurePictureCaptionFrame } from './picture-caption-frame.mjs';
import { signedInt32 } from './signed-int32.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';
import { selectPicturePageReservations } from './picture-page-selection.mjs';

// 배치와 줄 공간 계산은 기존 모듈이 소유합니다. 여기서는 페이지 소속만 연결합니다.
export function picturePageReservations(
  pictures,
  paragraphs,
  rows,
  {
    columnScoped = false,
    captionMeasure,
    captionParagraphs = paragraphs,
    maxCaptionRows = 20000,
    ...options
  } = {},
) {
  if (!Array.isArray(pictures))
    return { state: 'unavailable', error: 'InvalidPicturePageReservations' };
  if (!Number.isSafeInteger(maxCaptionRows) || maxCaptionRows < 1)
    return { state: 'unavailable', error: 'InvalidPictureCaptionBudget' };
  const reservations = [],
    captionRows = [],
    ids = new Set();
  for (const picture of pictures) {
    const key = `${picture.section}:${picture.pictureNode}`;
    if (ids.has(key)) return { state: 'unavailable', error: 'AmbiguousPicturePageReservations' };
    ids.add(key);
    if (![0, 1].includes(picture.flow?.textWrap))
      return { state: 'unavailable', error: 'UnsupportedPicturePageReservationWrap' };
    const result = projectFloatingPicturePage(picture, paragraphs, rows, options);
    if (result.state !== 'placed')
      return {
        ...result,
        section: picture.section,
        paragraph: picture.paragraph,
        pictureNode: picture.pictureNode,
      };
    const reservation = {
      pictureNode: picture.pictureNode,
      section: picture.section,
      pageOrdinal: result.pageOrdinal,
      rectangle: result.rectangle,
      flow: picture.flow,
    };
    if (columnScoped) {
      const column = result.referenceBoxes?.column;
      const margins = picture.flow.outsideMargins;
      const left = Array.isArray(margins) ? signedInt32(margins[0]) : null;
      const right = Array.isArray(margins) ? signedInt32(margins[1]) : null;
      if (
        ![0, 1].includes(picture.flow.textWrap) ||
        picture.caption != null ||
        left === null ||
        right === null ||
        ![2, 3].includes(picture.position?.relations?.[1]) ||
        !column ||
        ![column.x, column.width, column.x + column.width].every(Number.isFinite) ||
        column.width <= 0
      )
        return {
          state: 'unavailable',
          error: 'UnsupportedColumnPictureExtent',
          section: picture.section,
          paragraph: picture.paragraph,
          pictureNode: picture.pictureNode,
          pictureRectangle: result.rectangle,
          columnReference: column,
          paperReference: result.referenceBoxes?.paper,
        };
      const x = Math.min(result.rectangle.x, result.rectangle.x - hwpUnitPixels(left));
      const end = Math.max(
        result.rectangle.x + result.rectangle.width,
        result.rectangle.x + result.rectangle.width + hwpUnitPixels(right),
      );
      const contained = x >= column.x - 1e-8 && end <= column.x + column.width + 1e-8;
      reservation.columnBox = contained
        ? { x: column.x, width: column.width }
        : { x, width: end - x };
      if (!contained) {
        const paper = result.referenceBoxes?.paper;
        if (
          !paper ||
          ![
            paper.x,
            paper.y,
            paper.width,
            paper.height,
            paper.x + paper.width,
            paper.y + paper.height,
          ].every(Number.isFinite) ||
          paper.width <= 0 ||
          paper.height <= 0
        )
          return { state: 'unavailable', error: 'MissingColumnPicturePaper' };
        reservation.pageClip = { ...paper };
      }
    }
    if (picture.caption != null) {
      if (typeof captionMeasure !== 'function')
        return { state: 'unavailable', error: 'MissingPictureCaptionMeasurement' };
      if (captionRows.length >= maxCaptionRows)
        return { state: 'unavailable', error: 'PictureCaptionRowLimit' };
      const caption = measurePictureCaptionFrame(
        picture,
        captionParagraphs,
        result.rectangle,
        captionMeasure,
        { maxRows: maxCaptionRows - captionRows.length },
      );
      if (caption.state !== 'measured') return caption;
      reservation.flowRectangle = caption.flowRectangle;
      reservation.captionRectangle = caption.captionRectangle;
      captionRows.push(
        ...caption.rows.map((row) => ({
          ...row,
          pageOrdinal: result.pageOrdinal,
          referenceBoxes: result.referenceBoxes,
        })),
      );
    }
    reservations.push(reservation);
  }
  return { state: 'reserved', reservations, ...(captionRows.length ? { captionRows } : {}) };
}

export function picturePageLineRegions(line, pageOrdinal, reservations) {
  const selected = selectPicturePageReservations(line, pageOrdinal, reservations);
  return selected === null
    ? { state: 'invalid_page_reservations' }
    : intersectPictureLineRegions(line, selected, { includeNextEvent: true });
}
