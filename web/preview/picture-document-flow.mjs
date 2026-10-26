import { paginatePictureDocument } from './picture-document-pages.mjs';
import { picturePageReservations } from './picture-page-reservations.mjs';

// 매번 원문 문단에서 다시 측정해 이전 결과의 이동이 누적되지 않게 합니다.
export function paginatePictureDocumentFlow(
  paragraphs,
  setting,
  pictures,
  measure,
  flows,
  {
    maxIterations = 32,
    edgePolicy,
    captionMeasure,
    captionParagraphs,
    maxCaptionRows,
    ...options
  } = {},
) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > 1000)
    return unavailable('InvalidPictureFlowBudget');
  let page = paginatePictureDocument(paragraphs, setting, [], measure, flows, options);
  if (page.state !== 'paginated') return page;
  const reservationOptions = { edgePolicy, captionMeasure, captionParagraphs, maxCaptionRows };
  let reserved = picturePageReservations(pictures, paragraphs, page.rows, reservationOptions);
  if (reserved.state !== 'reserved') return reserved;
  const signature = (value) => JSON.stringify(value.reservations);
  let previousReservations;
  const anchorPages = new Map();
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    for (let index = 0; index < pictures.length; index++) {
      const picture = pictures[index],
        key = `${picture.section}:${picture.pictureNode}`;
      anchorPages.set(
        key,
        Math.max(anchorPages.get(key) ?? 0, reserved.reservations[index].pageOrdinal),
      );
    }
    page = paginatePictureDocument(paragraphs, setting, reserved.reservations, measure, flows, {
      ...options,
      minimumRowPage(row) {
        let minimum = options.minimumRowPage?.(row) ?? 0;
        if (!Number.isSafeInteger(minimum) || minimum < 0) return NaN;
        for (const picture of pictures)
          if (
            picture.section === row.section &&
            picture.paragraph === row.paragraph &&
            row.startUnit <= picture.anchorUnit &&
            picture.anchorUnit < row.endUnit
          )
            minimum = Math.max(
              minimum,
              anchorPages.get(`${picture.section}:${picture.pictureNode}`) ?? 0,
            );
        return minimum;
      },
    });
    if (page.state !== 'paginated') return page;
    const next = picturePageReservations(pictures, paragraphs, page.rows, reservationOptions);
    if (next.state !== 'reserved') return next;
    if (signature(next) === signature(reserved))
      return {
        ...page,
        pictureReservations: next.reservations,
        pictureFlowIterations: iteration + 1,
        ...(next.captionRows ? { pictureCaptionRows: next.captionRows } : {}),
      };
    previousReservations = reserved.reservations;
    reserved = next;
  }
  return {
    ...unavailable('PictureFlowConvergenceLimit'),
    pictureFlowIterations: maxIterations,
    previousPictureReservations: previousReservations,
    pictureReservations: reserved.reservations,
  };
}
