import { drawingPageReference } from './drawing-page-reference.mjs';
import { placeFloatingDrawing, drawingPagePlacementOptions } from './drawing-placement.mjs';
import { drawingCollisionInventory } from './drawing-collision-inventory.mjs';
import { drawingCellCollisionScope } from './drawing-cell-collision-scope.mjs';
import { restrictDrawingLayout } from './drawing-restricted-layout.mjs';
import { drawingHasOwnWrap } from './drawing-own-wrap.mjs';
import { withInlineDrawingCollisionSources } from './inline-drawing-collision-sources.mjs';

/** Reservation and final drawing use the same nominal placement and restriction policy. */
export function resolveDrawingWrapReservations(drawings, paragraphs, body, content) {
  const fail = (error) => ({ state: 'unavailable', error });
  const restricted = drawings.some(
    (d) => drawingHasOwnWrap(d) && d.source.position?.flags?.[1] === true,
  );
  const selected = restricted ? drawings : drawings.filter(drawingHasOwnWrap);
  const prepared = [];
  for (const drawing of selected) {
    const reference = drawingPageReference(drawing, paragraphs, body.rows);
    if (reference.state !== 'selected') return reference;
    const placed = placeFloatingDrawing(drawing, reference.boxes, drawingPagePlacementOptions);
    if (placed.state !== 'placed') return fail(placed.state);
    prepared.push({
      drawing,
      result: { ...placed, state: 'placed', rows: [], pageOrdinal: reference.host.pageOrdinal },
    });
  }
  const placements = prepared.map(({ drawing, result }) => ({
    section: drawing.section,
    drawingNode: drawing.drawingNode,
    pageOrdinal: result.pageOrdinal,
    rectangle: result.rectangle,
  }));
  if (restricted) {
    const layout = { ...body, placedDrawings: [...(body.placedDrawings ?? []), ...placements] };
    const collisionContent = withInlineDrawingCollisionSources(content, body);
    const inventory = drawingCollisionInventory(collisionContent, layout);
    if (inventory.state !== 'collected') return inventory;
    for (const [index, item] of prepared.entries()) {
      if (!drawingHasOwnWrap(item.drawing) || item.drawing.source.position.flags[1] !== true)
        continue;
      const scope = drawingCellCollisionScope(item.drawing, collisionContent, layout, inventory);
      if (scope.state !== 'scoped') return scope;
      const result = restrictDrawingLayout(item.drawing, item.result, scope.inventory, scope.body);
      if (result.state !== 'placed') return result;
      item.result = result;
      placements[index].rectangle = result.rectangle;
      const own = inventory.footprints.find(
        (f) =>
          f.kind === 'drawing' &&
          f.section === item.drawing.section &&
          f.node === item.drawing.drawingNode,
      );
      own.rectangle = result.collisionFootprint;
    }
  }
  return {
    state: 'reserved',
    reservations: prepared
      .filter(({ drawing }) => drawingHasOwnWrap(drawing))
      .map(({ drawing, result }) => ({
        section: drawing.section,
        drawingNode: drawing.drawingNode,
        pageOrdinal: result.pageOrdinal,
        rectangle: result.rectangle,
        flow: {
          textWrap: drawing.source.flow.text_wrap,
          textFlow: drawing.source.flow.text_flow,
          outsideMargins: drawing.source.flow.outside_margins,
        },
      })),
  };
}
