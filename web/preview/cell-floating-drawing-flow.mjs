import { nestedParagraphReference } from './nested-paragraph-reference.mjs';
import { placeFloatingDrawing, drawingPagePlacementOptions } from './drawing-placement.mjs';
import { drawingAxisGeometry } from './drawing-axis-geometry.mjs';
import { objectCollisionBox } from './object-collision-box.mjs';
import { intersectPictureLineRegions } from './picture-line-intersections.mjs';
import { cellRowInkBoxes } from './cell-row-ink-boxes.mjs';

// Preserve proven nonoverlapping cell text. Unresolved overlaps are explicit;
// no body-wide reservation or source-coordinate rewriting is substituted.
export function reserveCellFloatingDrawings(input, drawings) {
  if (
    !input?.table ||
    !input.cell ||
    !Array.isArray(input.cell.paragraphs) ||
    !input.flow ||
    !Array.isArray(input.paragraphs) ||
    input.paragraphs.some((p) => !p || typeof p.text !== 'string') ||
    !Number.isFinite(input.width) ||
    input.width <= 0 ||
    !Array.isArray(drawings) ||
    drawings.some((d) => !d || !Number.isSafeInteger(d.drawingNode) || d.drawingNode < 0)
  )
    return { state: 'unavailable', error: 'InvalidCellFloatingDrawingFlow' };
  const { table, cell } = input;
  let flow = input.flow;
  const selected = drawings.filter(
    (d) => d.section === table.section && cell.paragraphs.includes(d.hostParagraph),
  );
  if (!selected.length) return flow;
  const fail = (error, details = {}) => ({
    state: 'unavailable',
    error,
    section: table.section,
    tableNode: table.tableNode,
    listNode: cell.listNode,
    ...details,
  });
  if (flow.state === 'unavailable') return flow;
  if (
    table.parentTableNode != null ||
    input.columnContext?.declaration?.count > 1 ||
    flow.floatingDrawings !== undefined ||
    selected.length !== 1 ||
    input.pictures?.length ||
    flow.boxes?.length ||
    flow.floatingTables?.length ||
    !Array.isArray(flow.rows) ||
    flow.rows.some(
      (r) => !r || ![r.y, r.height].every(Number.isFinite) || r.y < 0 || r.height <= 0,
    ) ||
    !Number.isFinite(flow.height) ||
    flow.height < 0
  )
    return fail('UnsupportedCellFloatingDrawingFlow');
  const reservations = [],
    nodes = new Set();
  let height = flow.height,
    advances = 0;
  for (const drawing of selected) {
    const source = drawing.source,
      host = input.paragraphs.find((p) => p.paragraph === drawing.hostParagraph);
    if (
      !host ||
      host.tableCell?.tableNode !== table.tableNode ||
      host.tableCell.listNode !== cell.listNode ||
      !Number.isSafeInteger(drawing.anchorUnit) ||
      host.text[drawing.anchorUnit] !== '\ufffc' ||
      nodes.has(drawing.drawingNode) ||
      !drawingAxisGeometry(source) ||
      source.group_context !== null ||
      source.caption ||
      source.geometry.treat_as_character !== false ||
      ![0, 1].includes(source.flow?.text_wrap) ||
      source.position?.relations?.[0] !== 2 ||
      ![2, 3].includes(source.position?.relations?.[1]) ||
      source.position.relations[2] !== 0
    )
      return fail('UnsupportedCellFloatingDrawingFlow', { drawingNode: drawing.drawingNode });
    nodes.add(drawing.drawingNode);
    const reference = nestedParagraphReference(host, flow, { x: 0, y: 0 });
    if (reference.state !== 'referenced') return reference;
    const placement = placeFloatingDrawing(
      drawing,
      {
        paragraph: reference.rectangle,
        column: { x: 0, y: 0, width: input.width, height: Math.max(input.height, height, 1) },
      },
      drawingPagePlacementOptions,
    );
    if (placement.state !== 'placed')
      return fail('UnsupportedCellFloatingDrawingPosition', { drawingNode: drawing.drawingNode });
    const rectangle = objectCollisionBox(placement.rectangle, source.flow.outside_margins);
    if (
      !rectangle ||
      ![
        rectangle.x,
        rectangle.y,
        rectangle.width,
        rectangle.height,
        rectangle.x + rectangle.width,
        rectangle.y + rectangle.height,
      ].every(Number.isFinite) ||
      rectangle.x < 0 ||
      rectangle.y < 0 ||
      rectangle.width <= 0 ||
      rectangle.height <= 0 ||
      rectangle.x + rectangle.width > input.width + 1e-8
    )
      return fail('CellFloatingDrawingBounds', { drawingNode: drawing.drawingNode });
    rowLoop: for (let index = 0; index < flow.rows.length; index++) {
      const row = flow.rows[index];
      if (row.kind !== 'text') continue;
      const paragraph = input.paragraphs.find((p) => p.paragraph === row.paragraph);
      if (!paragraph) return fail('InvalidCellFloatingDrawingTextBounds');
      const ink = cellRowInkBoxes(
        row,
        paragraph,
        new Set(
          selected.filter((d) => d.hostParagraph === paragraph.paragraph).map((d) => d.anchorUnit),
        ),
        (flow.inlineDrawings ?? [])
          .filter((e) => e.drawing.hostParagraph === paragraph.paragraph)
          .map((e) => ({
            unit: e.drawing.anchorUnit,
            width: e.measured.width,
            height: e.measured.height,
          })),
      );
      if (ink.state !== 'measured') return fail(ink.error);
      for (const box of ink.boxes) {
        const region = intersectPictureLineRegions(box, [
          {
            rectangle: placement.rectangle,
            flow: {
              textWrap: source.flow.text_wrap,
              textFlow: source.flow.text_flow,
              outsideMargins: source.flow.outside_margins,
            },
          },
        ]);
        if (
          region.state === 'available' &&
          !region.regions.some((r) => r.x <= box.x && r.x + r.width >= box.x + box.width - 1e-8)
        ) {
          const objects = (flow.inlineDrawings ?? []).filter(
            (e) => e.drawing.hostParagraph === paragraph.paragraph,
          );
          const available = intersectPictureLineRegions(
            { x: 0, y: box.y, width: input.width, height: box.height },
            [
              {
                rectangle: placement.rectangle,
                flow: {
                  textWrap: source.flow.text_wrap,
                  textFlow: source.flow.text_flow,
                  outsideMargins: source.flow.outside_margins,
                },
              },
            ],
          );
          if (
            paragraph.paragraph !== host.paragraph &&
            paragraph.text === '\ufffc' &&
            objects.length === 1 &&
            available.state === 'available' &&
            available.regions.every((r) => r.width < box.width)
          ) {
            const advance = rectangle.y + rectangle.height - box.y;
            if (
              !Number.isFinite(advance) ||
              advance <= 0 ||
              !Number.isFinite(flow.height + advance) ||
              ++advances > flow.rows.length
            )
              return fail('InvalidCellFloatingDrawingAdvance');
            const first = flow.rows.findIndex((r) => r.paragraph === paragraph.paragraph);
            flow = {
              ...flow,
              rows: flow.rows.map((r, i) => (i < first ? r : { ...r, y: r.y + advance })),
              height: flow.height + advance,
            };
            height = Math.max(height, flow.height);
            index--;
            continue rowLoop;
          }
        }
        if (
          region.state !== 'available' ||
          !region.regions.some((r) => r.x <= box.x && r.x + r.width >= box.x + box.width - 1e-8)
        )
          return fail('UnsupportedCellFloatingDrawingTextOverlap', {
            paragraph: row.paragraph,
            drawingNode: drawing.drawingNode,
            rectangle: placement.rectangle,
            body: box,
          });
      }
    }
    const hostRows = flow.rows.filter(
      (r) => r.kind === 'text' && r.paragraph === drawing.hostParagraph,
    );
    let start = rectangle.y,
      end = rectangle.y + rectangle.height;
    for (const row of hostRows) {
      start = Math.min(start, row.y);
      end = Math.max(end, row.y + row.height);
    }
    if (!Number.isFinite(end) || end <= start) return fail('InvalidCellFloatingDrawingReservation');
    height = Math.max(height, end);
    reservations.push({
      section: table.section,
      tableNode: table.tableNode,
      listNode: cell.listNode,
      drawingNode: drawing.drawingNode,
      paragraph: drawing.hostParagraph,
      rectangle,
      start,
      end,
    });
  }
  return { ...flow, height, floatingDrawings: reservations };
}
