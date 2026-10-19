import { paginateBodyRows } from "./page-row-flow.mjs";
import { bodyRowSources } from "./body-row-sources.mjs";
import { measureReservedBodyRow } from "./reserved-body-row.mjs";
import { picturePageReservations } from "./picture-page-reservations.mjs";

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
  const placement = { edgePolicy: options.edgePolicy, captionMeasure, captionParagraphs, maxCaptionRows: options.maxRows ?? 20000 };
  let reserved = picturePageReservations(pictures, paragraphs, page.rows, placement);
  if (reserved.state !== "reserved") return reserved;
  const signature = value => JSON.stringify(value.reservations.map(r => [r.section, r.pictureNode, r.pageOrdinal, r.rectangle, r.flowRectangle]));
  const anchorPages = new Map();
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    for (let i = 0; i < pictures.length; i++) {
      const key = `${pictures[i].section}:${pictures[i].paragraph}`;
      anchorPages.set(key, Math.max(anchorPages.get(key) ?? 0, reserved.reservations[i].pageOrdinal));
    }
    let failure;
    page = paginateBodyRows(sources.rows, setting, flows, { ...options,
      minimumRowPage(row) {
        return Math.max(options.minimumRowPage?.(row) ?? 0, anchorPages.get(`${row.section}:${row.paragraph}`) ?? 0);
      },
      rowY(row, context) {
        let y = options.rowY?.(row, context) ?? context.y;
        if (!Number.isFinite(y) || y < context.y) { failure = "InvalidReservedPictureAdvance"; return NaN; }
        if (!row.paragraphSource) return y;
        for (let attempt = 0; attempt < maxIterations; attempt++) {
          const measured = measureReservedBodyRow(row, { ...context, y }, reserved.reservations, measure);
          if (measured.state !== "measured") { failure = measured.error; return NaN; }
          const next = options.rowY?.(row, { ...context, y: measured.y }) ?? measured.y;
          if (!Number.isFinite(next) || next < measured.y) { failure = "InvalidReservedPictureAdvance"; return NaN; }
          if (next === measured.y) return next;
          y = next;
        }
        failure = "ReservedPictureAdvanceLimit"; return NaN;
      },
      measurePositionedRow(source, row, context) {
        if (!source.paragraphSource) return row;
        const measured = measureReservedBodyRow(source, context, reserved.reservations, measure);
        if (measured.state !== "measured" || measured.y !== context.y) {
          failure = measured.error ?? "UnresolvedReservedPictureAdvance"; return null;
        }
        return measured.row;
      },
    });
    if (failure) return fail(failure);
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
