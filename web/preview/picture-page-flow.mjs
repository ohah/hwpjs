import { paginateBodyRows } from "./page-row-flow.mjs";
import { picturePageReservations, picturePageLineRegions } from "./picture-page-reservations.mjs";

// 매 반복은 원본 측정 행에서 시작합니다. 이전 출력 행을 누적 이동하지 않습니다.
export function paginatePictureRows(rows, setting, flows, pictures, paragraphs, { maxIterations = 32, ...options } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > 1000 || options.rowY !== undefined || options.minimumRowPage !== undefined) return unavailable("InvalidPictureFlowBudget");
  if (!Array.isArray(pictures) || pictures.some(p => p.flow?.textWrap !== 1 || p.position?.relations?.[2] !== 0)) return unavailable("UnsupportedPictureFlowPolicy");
  let page = paginateBodyRows(rows, setting, flows, options);
  if (page.state !== "paginated" || page.limited) return page;
  let reserved = picturePageReservations(pictures, paragraphs, page.rows);
  if (reserved.state !== "reserved") return reserved;
  const signature = value => JSON.stringify(value.reservations.map(item => [item.section, item.pictureNode, item.pageOrdinal, item.rectangle]));
  let previousReservations;
  const anchorPages = new Map();
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    for (let index = 0; index < pictures.length; index++) {
      const picture = pictures[index], reservation = reserved.reservations[index];
      const key = `${picture.section}:${picture.paragraph}`;
      anchorPages.set(key, Math.max(anchorPages.get(key) ?? 0, reservation.pageOrdinal));
    }
    let failure;
    // 그림이 밀어낸 호스트를 이전 페이지로 되돌려 예약을 진동시키지 않습니다.
    page = paginateBodyRows(rows, setting, flows, { ...options,
      minimumRowPage: row => anchorPages.get(`${row.section}:${row.paragraph}`) ?? 0,
      rowY(row, context) {
      let y = context.y;
      for (let attempt = 0; attempt <= reserved.reservations.length; attempt++) {
        const region = picturePageLineRegions({ x: context.column.x, y, width: context.column.width, height: row.height }, context.pageOrdinal, reserved.reservations);
        if (region.state !== "available") { failure = region.state; return NaN; }
        if (region.regions.length) return y;
        if (!Number.isFinite(region.nextY) || region.nextY <= y) { failure = "InvalidPictureFlowAdvance"; return NaN; }
        y = region.nextY;
      }
      failure = "PictureFlowAdvanceLimit"; return NaN;
    } });
    if (failure) return unavailable(failure);
    if (page.state !== "paginated" || page.limited) return page;
    const next = picturePageReservations(pictures, paragraphs, page.rows);
    if (next.state !== "reserved") return next;
    if (signature(next) === signature(reserved)) return { ...page, pictureReservations: next.reservations, pictureFlowIterations: iteration + 1 };
    previousReservations = reserved.reservations;
    reserved = next;
  }
  return { ...unavailable("PictureFlowConvergenceLimit"), pictureFlowIterations: maxIterations,
    previousPictureReservations: previousReservations, pictureReservations: reserved.reservations };
}
