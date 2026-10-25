import { paginateBodyRows } from "./page-row-flow.mjs";
import { bodyRowSources } from "./body-row-sources.mjs";
import { createReservedBodyCallbacks } from "./reserved-body-callbacks.mjs";
import { picturePageReservations } from "./picture-page-reservations.mjs";
import { pictureCaptionPageFit } from "./picture-caption-page-fit.mjs";

// 매 반복은 원문 carrier에서 시작합니다. 표 행의 형태나 수평 위치는 바꾸지 않습니다.
export function paginateReservedPictureRows(rows, setting, flows, pictures, paragraphs, measure, {
  maxIterations = 32, captionParagraphs = paragraphs, captionMeasure = measure, ...options
} = {}) {
  const fail = error => ({ state: "unavailable", error });
  if (typeof measure !== "function" || !Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > 1000
    || options.measurePositionedRow !== undefined
    || (options.rowY !== undefined && typeof options.rowY !== "function")
    || (options.minimumRowPage !== undefined && typeof options.minimumRowPage !== "function")) return fail("InvalidReservedPictureFlow");
  if (!Array.isArray(pictures) || pictures.some(p => ![0, 1].includes(p?.flow?.textWrap) || p.position?.relations?.[2] !== 0)) return fail("UnsupportedReservedPicturePolicy");
  const sources = bodyRowSources(rows, paragraphs, { maxRows: options.maxRows });
  if (sources.state !== "prepared") return sources;
  let page = paginateBodyRows(rows, setting, flows, options);
  if (page.state !== "paginated" || page.limited) return page;
  const placement = { columnScoped: options.columnZones === true, edgePolicy: options.edgePolicy, captionMeasure, captionParagraphs, maxCaptionRows: options.maxRows ?? 20000 };
  let reserved = picturePageReservations(pictures, paragraphs, page.rows, placement);
  if (reserved.state !== "reserved") return reserved;
  const signature = value => JSON.stringify(value.reservations.map(r => [r.section, r.pictureNode, r.pageOrdinal, r.rectangle, r.flowRectangle, r.columnBox]));
  const anchorPages = new Map();
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    for (let i = 0; i < pictures.length; i++) {
      const key = `${pictures[i].section}:${pictures[i].paragraph}`;
      const reservation = reserved.reservations[i];
      const fit = pictureCaptionPageFit(reservation, page.pages.find(p => p.ordinal === reservation.pageOrdinal));
      if (fit.state === "unavailable") return fit;
      anchorPages.set(key, Math.max(anchorPages.get(key) ?? 0, reservation.pageOrdinal + (fit.state === "advance" ? 1 : 0)));
    }
    const callbacks = createReservedBodyCallbacks(reserved.reservations, measure, { rowY: options.rowY, maxIterations });
    if (callbacks.state !== "ready") return callbacks;
    page = paginateBodyRows(sources.rows, setting, flows, { ...options,
      minimumRowPage(row) {
        return Math.max(options.minimumRowPage?.(row) ?? 0, anchorPages.get(`${row.section}:${row.paragraph}`) ?? 0);
      },
      rowY: callbacks.rowY,
      measurePositionedRow: callbacks.measurePositionedRow,
    });
    if (callbacks.failure()) return {...fail(callbacks.failure()),...callbacks.diagnostic()};
    if (page.state !== "paginated" || page.limited) return page;
    const next = picturePageReservations(pictures, paragraphs, page.rows, placement);
    if (next.state !== "reserved") return next;
    if (signature(next) === signature(reserved)) {
      if (page.rows.length + (next.captionRows?.length ?? 0) > (options.maxRows ?? 20000)) return fail("PictureCaptionRowLimit");
      return { ...page, pictureReservations: next.reservations, pictureCaptionRows: next.captionRows ?? [], pictureFlowIterations: iteration + 1 };
    }
    reserved = next;
  }
  return { ...fail("ReservedPictureConvergenceLimit"), pictureFlowIterations: maxIterations };
}
