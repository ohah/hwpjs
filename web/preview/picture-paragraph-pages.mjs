import { pageSequenceReference } from './page-sequence-reference.mjs';
import { layoutPicturePageParagraph } from './picture-page-paragraph.mjs';
import { paragraphReferenceGeometry } from './paragraph-geometry.mjs';
import { paragraphLineProbeHeight } from './paragraph-line-probe-height.mjs';
import { DEFAULT_ROW_HEIGHT } from './row-geometry.mjs';

// 단일 문단의 페이지 이어받기입니다. 문서 문단 간 간격/강제 나눔은 호출자가 소유합니다.
export function paginatePictureParagraph(
  paragraph,
  setting,
  reservations,
  measure,
  {
    maxPages = 2000,
    maxRows = 20000,
    startPage = 0,
    startY = null,
    minimumRowPage,
    ...origin
  } = {},
) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (
    !Number.isSafeInteger(maxPages) ||
    maxPages < 1 ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return unavailable('InvalidPictureParagraphPageBudget');
  if (
    !Number.isSafeInteger(startPage) ||
    startPage < 0 ||
    (startY !== null && !Number.isFinite(startY))
  )
    return unavailable('InvalidPictureParagraphPageStart');
  if (!paragraph || typeof paragraph.text !== 'string' || typeof measure !== 'function')
    return unavailable('InvalidPicturePageParagraph');
  const rows = [],
    pages = [];
  let unit = 0;
  for (let offset = 0; offset < maxPages; offset++) {
    const ordinal = startPage + offset;
    const reference = pageSequenceReference(setting, ordinal, origin);
    if (reference.state !== 'placed') return unavailable(reference.state);
    if (rows.length >= maxRows) return unavailable('PicturePageParagraphRowLimit');
    const body = reference.boxes.page;
    const y = offset === 0 && startY !== null ? startY : body.y;
    if (y < body.y || y > body.y + body.height)
      return unavailable('InvalidPictureParagraphPageStart');
    const probe = paragraphLineProbeHeight(
      paragraph.paragraphShape,
      (text, at) => measure(text, paragraph, at, 'text'),
      unit,
      DEFAULT_ROW_HEIGHT,
    );
    if (body.height >= probe && body.y + body.height - y < probe) continue;
    const remainingHeight =
      y === body.y ? body.height : Math.min(body.height, body.y + body.height - y);
    const result = layoutPicturePageParagraph(
      paragraph,
      unit,
      { ...body, y, height: remainingHeight },
      ordinal,
      reservations,
      measure,
      { maxRows: maxRows - rows.length, pageHeight: body.height, minimumRowPage },
    );
    if (!['continued', 'complete'].includes(result.state)) return result;
    const page = { ordinal, ...reference.boxes, columns: [reference.boxes.page] };
    const geometry = paragraphReferenceGeometry(paragraph.paragraphShape, body.width);
    pages.push(page);
    rows.push(
      ...result.rows.map((row) => ({
        ...row,
        flowAnchorY: y,
        columnOrdinal: 0,
        flowParagraphBox: { x: body.x + geometry.x, width: geometry.width },
        referenceBoxes: { paper: page.paper, page: page.page, column: page.page },
      })),
    );
    if (result.state === 'complete')
      return {
        state: 'paginated',
        rows,
        pages,
        limited: false,
        spatialRows: true,
        pageLayoutMode: 'measured-body',
        height: page.paper.y + page.paper.height,
        endPage: ordinal,
        nextY: result.nextY,
      };
    unit = result.endUnit;
  }
  return unavailable('PictureParagraphPageLimit');
}
