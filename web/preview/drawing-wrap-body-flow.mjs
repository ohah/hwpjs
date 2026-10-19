import { drawingPageReference } from "./drawing-page-reference.mjs";
import { placeFloatingDrawing, drawingPagePlacementOptions } from "./drawing-placement.mjs";
import { intersectPictureLineRegions } from "./picture-line-intersections.mjs";

// 반복마다 원본 본문을 재조판합니다. 이전 출력 행을 직접 이동하지 않습니다.
export function layoutDrawingWrapBody(drawings, paragraphs, layoutBody, { maxIterations = 32 } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > 1000) return unavailable("InvalidDrawingWrapBudget");
  const wrapped = drawings.filter(drawing => drawing.source?.flow?.text_wrap === 1);
  let body = layoutBody({});
  if (!wrapped.length || body.state !== "paginated" || body.limited) return body;
  const reservations = rows => {
    const result = [];
    for (const drawing of wrapped) {
      const reference = drawingPageReference(drawing, paragraphs, rows);
      if (reference.state !== "selected") return reference;
      const placed = placeFloatingDrawing(drawing, reference.boxes, drawingPagePlacementOptions);
      if (placed.state !== "placed") return unavailable(placed.state);
      const flow = drawing.source.flow;
      result.push({ section: drawing.section, drawingNode: drawing.drawingNode, pageOrdinal: reference.host.pageOrdinal,
        rectangle: placed.rectangle, flow: { textWrap: flow.text_wrap, textFlow: flow.text_flow, outsideMargins: flow.outside_margins } });
    }
    return { state: "reserved", reservations: result };
  };
  let reserved = reservations(body.rows);
  if (reserved.state !== "reserved") return reserved;
  const signature = value => JSON.stringify(value.reservations);
  const anchorPages = new Map();
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    wrapped.forEach((drawing, index) => {
      const key = `${drawing.section}:${drawing.hostParagraph}`;
      anchorPages.set(key, Math.max(anchorPages.get(key) ?? 0, reserved.reservations[index].pageOrdinal));
    });
    let failure;
    body = layoutBody({
      minimumRowPage: row => anchorPages.get(`${row.section}:${row.paragraph}`) ?? 0,
      rowY(row, context) {
        let y = context.y;
        const local = reserved.reservations.filter(item => item.section === row.section && item.pageOrdinal === context.pageOrdinal);
        for (let attempt = 0; attempt <= local.length; attempt++) {
          const region = intersectPictureLineRegions({ x: context.column.x, y, width: context.column.width, height: row.height }, local);
          if (region.state !== "available") { failure = region.state; return NaN; }
          if (region.regions.length) return y;
          if (!Number.isFinite(region.nextY) || region.nextY <= y) { failure = "InvalidDrawingWrapAdvance"; return NaN; }
          y = region.nextY;
        }
        failure = "DrawingWrapAdvanceLimit"; return NaN;
      },
    });
    if (failure) return unavailable(failure);
    if (body.state !== "paginated" || body.limited) return body;
    const next = reservations(body.rows);
    if (next.state !== "reserved") return next;
    if (signature(next) === signature(reserved)) {
      // 재조판 하위 경로가 옵션을 무시했거나 표의 후속 배치가 예약을 침범하면
      // 성공으로 승격하지 않습니다. 본문 행과 표의 외곽을 모두 검사합니다.
      const occupied = [...body.rows.filter(row => row.kind === "text" || row.kind === "gap"),
        ...(body.tableCollisionFootprints ?? []).map(item => ({ ...item.rectangle, section: item.section, pageOrdinal: item.pageOrdinal }))];
      for (const row of occupied) {
        if (row.transform !== undefined) return unavailable("UnsupportedDrawingWrapBodyTransform");
        const local = next.reservations.filter(item => item.section === row.section && item.pageOrdinal === row.pageOrdinal);
        const region = intersectPictureLineRegions({ x: row.x ?? 0, y: row.y, width: row.width, height: row.height }, local);
        if (region.state !== "available" || !region.regions.length) return unavailable("IncompleteDrawingWrapFlow");
      }
      return { ...body, drawingWrapReservations: next.reservations, drawingWrapIterations: iteration + 1 };
    }
    reserved = next;
  }
  return { ...unavailable("DrawingWrapConvergenceLimit"), drawingWrapIterations: maxIterations, drawingWrapReservations: reserved.reservations };
}
