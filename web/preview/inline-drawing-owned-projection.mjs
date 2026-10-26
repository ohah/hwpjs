import { inlinePictureRowPlacement } from './inline-picture-row-placement.mjs';
import { layoutInlineDrawingPageContent } from './inline-drawing-page-content.mjs';

// Shared completion for body and cell-owned inline drawings, after horizontal
// placement and CELL selection. Affine child rows are translated exactly once.
export function projectOwnedInlineDrawings(entries, layout, maxRows) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    !Array.isArray(entries) ||
    layout?.state !== 'placed' ||
    !Array.isArray(layout.rows) ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return fail('InvalidCellInlineDrawingProjection');
  const rows = [...layout.rows],
    placedDrawings = [...(layout.placedDrawings ?? [])],
    nodes = new Set();
  const boxes = [...layout.boxes],
    tableAnchors = [...(layout.tableAnchors ?? [])],
    footprints = [],
    sources = [];
  for (const entry of entries) {
    const drawing = entry?.drawing,
      owner = entry?.owner;
    const identity = `${drawing?.section}:${drawing?.drawingNode}`;
    if (
      !drawing ||
      owner?.section !== drawing.section ||
      owner.paragraph !== drawing.hostParagraph ||
      nodes.has(identity)
    )
      return fail('AmbiguousCellInlineDrawingOwner');
    nodes.add(identity);
    const matches = layout.rows.filter(
      (row) =>
        row.kind === 'text' &&
        row.section === drawing.section &&
        row.paragraph === drawing.hostParagraph &&
        row.startUnit <= drawing.anchorUnit &&
        drawing.anchorUnit < row.endUnit,
    );
    if (matches.length !== 1) return fail('AmbiguousCellInlineDrawingOwner');
    const row = matches[0],
      measured = entry.measured;
    if (
      owner.tableCell &&
      (row.tableNode !== owner.tableCell.tableNode || row.listNode !== owner.tableCell.listNode)
    )
      return fail('AmbiguousCellInlineDrawingOwner');
    const local = inlinePictureRowPlacement(
      {
        picture: {
          section: drawing.section,
          paragraph: drawing.hostParagraph,
          anchorUnit: drawing.anchorUnit,
        },
        width: measured?.width,
        height: measured?.height,
      },
      row,
      0,
    );
    if (local.state !== 'placed') return local;
    const rectangle = local.rectangle,
      paper = row.referenceBoxes?.paper;
    if (
      row.transform !== undefined ||
      (owner.tableCell && rectangle.y + rectangle.height > row.y + row.height + 1e-8)
    )
      return fail('SplitCellInlineDrawing');
    if (
      !paper ||
      ![
        rectangle.x,
        rectangle.y,
        rectangle.width,
        rectangle.height,
        rectangle.x + rectangle.width,
        rectangle.y + rectangle.height,
        paper.x,
        paper.y,
        paper.width,
        paper.height,
        paper.x + paper.width,
        paper.y + paper.height,
      ].every(Number.isFinite) ||
      paper.width <= 0 ||
      paper.height <= 0 ||
      rectangle.x < paper.x - 1e-8 ||
      rectangle.y < paper.y - 1e-8 ||
      rectangle.x + rectangle.width > paper.x + paper.width + 1e-8 ||
      rectangle.y + rectangle.height > paper.y + paper.height + 1e-8
    )
      return fail('CellInlineDrawingPaperOverflow');
    const available = maxRows - rows.length - (layout.repeatedTableHeaderRows?.length ?? 0);
    if (available < 1) return fail('TablePageProjectionLimit');
    const placement = {
      objectNode: drawing.drawingNode,
      section: drawing.section,
      paragraph: drawing.hostParagraph,
      unit: drawing.anchorUnit,
      rectangle,
      pageOrdinal: row.pageOrdinal,
      columnOrdinal: row.columnOrdinal,
      referenceBoxes: row.referenceBoxes,
    };
    const projected = layoutInlineDrawingPageContent(
      drawing,
      entry.paragraphs,
      entry.context.declaration,
      placement,
      () => 0,
      { measurement: measured, maxRows: available },
    );
    if (projected.state !== 'placed') return projected;
    rows.push(...projected.rows);
    boxes.push(...(projected.boxes ?? []));
    tableAnchors.push(...(projected.tableAnchors ?? []));
    footprints.push(...(projected.inlineTableFootprints ?? []));
    sources.push(...(projected.inlineTableSources ?? []));
    placedDrawings.push({
      section: drawing.section,
      drawingNode: drawing.drawingNode,
      hostParagraph: drawing.hostParagraph,
      anchorUnit: drawing.anchorUnit,
      rectangle: projected.rectangle,
      pageOrdinal: row.pageOrdinal,
      ...(owner.tableCell
        ? {
            positionOwnerTableNode: owner.tableCell.tableNode,
            ownerListNode: owner.tableCell.listNode,
          }
        : {}),
    });
  }
  return {
    ...layout,
    rows,
    boxes,
    tableAnchors,
    placedDrawings,
    inlineTableFootprints: footprints,
    inlineTableSources: sources,
    inlineDrawingSources: entries.map((entry) => entry.drawing),
    inlineDrawingParagraphs: entries.flatMap((entry) =>
      entry.paragraphs.filter((p) => p !== entry.owner),
    ),
    inlineDrawingPictures: entries.flatMap((entry) => entry.pictures ?? []),
  };
}
