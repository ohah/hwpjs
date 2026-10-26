import { drawingPageReference } from './drawing-page-reference.mjs';
import { placeFloatingDrawing, drawingPagePlacementOptions } from './drawing-placement.mjs';
import { intersectPictureLineRegions } from './picture-line-intersections.mjs';
import { paginateReservedBodyRows } from './reserved-body-pagination.mjs';
import { drawingHasOwnWrap } from './drawing-own-wrap.mjs';
import { rowLeft, isZeroAdvanceTextAnchor } from './row-geometry.mjs';

// 반복마다 원본 본문을 재조판합니다. 이전 출력 행을 직접 이동하지 않습니다.
export function layoutDrawingWrapBody(
  drawings,
  paragraphs,
  layoutBody,
  { maxIterations = 32, measure, resolveReservations } = {},
) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > 1000)
    return unavailable('InvalidDrawingWrapBudget');
  const wrapped = drawings.filter(drawingHasOwnWrap);
  const square = wrapped.some((drawing) => drawing.source.flow.text_wrap === 0);
  if (
    (square && typeof measure !== 'function') ||
    (resolveReservations !== undefined && typeof resolveReservations !== 'function')
  )
    return unavailable('InvalidDrawingWrapMeasurement');
  let body = layoutBody({});
  if (!wrapped.length || body.state !== 'paginated' || body.limited) return body;
  const reservations = (layout) => {
    if (resolveReservations) return resolveReservations(layout);
    const rows = layout.rows;
    const result = [];
    for (const drawing of wrapped) {
      const reference = drawingPageReference(drawing, paragraphs, rows);
      if (reference.state !== 'selected') return reference;
      const placed = placeFloatingDrawing(drawing, reference.boxes, drawingPagePlacementOptions);
      if (placed.state !== 'placed') return unavailable(placed.state);
      const flow = drawing.source.flow;
      result.push({
        section: drawing.section,
        drawingNode: drawing.drawingNode,
        pageOrdinal: reference.host.pageOrdinal,
        rectangle: placed.rectangle,
        flow: {
          textWrap: flow.text_wrap,
          textFlow: flow.text_flow,
          outsideMargins: flow.outside_margins,
        },
      });
    }
    return { state: 'reserved', reservations: result };
  };
  let reserved = reservations(body);
  if (reserved.state !== 'reserved') return reserved;
  const signature = (value) => JSON.stringify(value.reservations);
  const anchorPages = new Map();
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    wrapped.forEach((drawing, index) => {
      const key = `${drawing.section}:${drawing.hostParagraph}`;
      anchorPages.set(
        key,
        Math.max(anchorPages.get(key) ?? 0, reserved.reservations[index].pageOrdinal),
      );
    });
    let failure;
    body = layoutBody({
      ...(square
        ? {
            paginateRows: (rows, setting, flows, options, paginate) =>
              paginateReservedBodyRows(
                rows,
                setting,
                flows,
                paragraphs,
                reserved.reservations,
                measure,
                options,
                paginate,
              ),
          }
        : {}),
      minimumRowPage: (row) => anchorPages.get(`${row.section}:${row.paragraph}`) ?? 0,
      rowY(row, context) {
        let y = context.y;
        const local = reserved.reservations
          .filter(
            (item) => item.section === row.section && item.pageOrdinal === context.pageOrdinal,
          )
          .map((item) =>
            row.kind === 'gap' && item.flow?.textWrap === 0
              ? { ...item, flow: { ...item.flow, textWrap: 1 } }
              : item,
          );
        for (let attempt = 0; attempt <= local.length; attempt++) {
          const region = intersectPictureLineRegions(
            { x: context.column.x, y, width: context.column.width, height: row.height },
            local,
          );
          if (region.state !== 'available') {
            failure = region.state;
            return NaN;
          }
          if (region.regions.length) return y;
          if (!Number.isFinite(region.nextY) || region.nextY <= y) {
            failure = 'InvalidDrawingWrapAdvance';
            return NaN;
          }
          y = region.nextY;
        }
        failure = 'DrawingWrapAdvanceLimit';
        return NaN;
      },
    });
    if (failure) return unavailable(failure);
    if (body.state !== 'paginated' || body.limited) return body;
    const next = reservations(body);
    if (next.state !== 'reserved') return next;
    if (signature(next) === signature(reserved)) {
      // 재조판 하위 경로가 옵션을 무시했거나 표의 후속 배치가 예약을 침범하면
      // 성공으로 승격하지 않습니다. 본문 행과 표의 외곽을 모두 검사합니다.
      const occupied = [
        ...body.rows.filter(
          (row) => (row.kind === 'text' || row.kind === 'gap') && !isZeroAdvanceTextAnchor(row),
        ),
        ...(body.tableCollisionFootprints ?? []).map((item) => ({
          ...item.rectangle,
          section: item.section,
          pageOrdinal: item.pageOrdinal,
        })),
      ];
      for (const row of occupied) {
        if (row.transform !== undefined) return unavailable('UnsupportedDrawingWrapBodyTransform');
        const local = next.reservations.filter(
          (item) => item.section === row.section && item.pageOrdinal === row.pageOrdinal,
        );
        // 문단 간격 행은 잉크 폭이 없지만 배치된 단 전체를 예약합니다.
        const bounds =
          row.kind === 'gap'
            ? {
                x: row.referenceBoxes?.column?.x,
                y: row.y,
                width: row.referenceBoxes?.column?.width,
                height: row.height,
              }
            : { x: rowLeft(row), y: row.y, width: row.width, height: row.height };
        const region = intersectPictureLineRegions(bounds, local);
        if (
          region.state !== 'available' ||
          region.regions.length !== 1 ||
          Math.abs(region.regions[0].x - bounds.x) > 1e-8 ||
          Math.abs(region.regions[0].width - bounds.width) > 1e-8
        )
          return {
            ...unavailable('IncompleteDrawingWrapFlow'),
            section: row.section,
            paragraph: row.paragraph,
            pageOrdinal: row.pageOrdinal,
            collisionBounds: bounds,
            collisionReservations: local,
          };
      }
      return {
        ...body,
        drawingWrapReservations: next.reservations,
        drawingWrapIterations: iteration + 1,
      };
    }
    reserved = next;
  }
  return {
    ...unavailable('DrawingWrapConvergenceLimit'),
    drawingWrapIterations: maxIterations,
    drawingWrapReservations: reserved.reservations,
  };
}
