import { paginatePictureDocument } from "./picture-document-pages.mjs";
import { picturePageReservations } from "./picture-page-reservations.mjs";

// 매번 원문 문단에서 다시 측정해 이전 결과의 이동이 누적되지 않게 합니다.
export function paginatePictureDocumentFlow(paragraphs, setting, pictures, measure, flows, { maxIterations = 32, edgePolicy, ...options } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > 1000) return unavailable("InvalidPictureFlowBudget");
  let page = paginatePictureDocument(paragraphs, setting, [], measure, flows, options);
  if (page.state !== "paginated") return page;
  let reserved = picturePageReservations(pictures, paragraphs, page.rows, { edgePolicy });
  if (reserved.state !== "reserved") return reserved;
  const signature = value => JSON.stringify(value.reservations);
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    page = paginatePictureDocument(paragraphs, setting, reserved.reservations, measure, flows, options);
    if (page.state !== "paginated") return page;
    const next = picturePageReservations(pictures, paragraphs, page.rows, { edgePolicy });
    if (next.state !== "reserved") return next;
    if (signature(next) === signature(reserved)) return { ...page, pictureReservations: next.reservations, pictureFlowIterations: iteration + 1 };
    reserved = next;
  }
  return unavailable("PictureFlowConvergenceLimit");
}
