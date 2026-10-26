import { tableCollisionFootprints } from './table-collision-footprints.mjs';

// Check complete source-table extents, including outer margins, after placement.
export function sourceInlineTablePaperBounds(tables, layout, content) {
  const fail = () => ({ state: 'unavailable', error: 'InvalidSourceInlineTablePaperBounds' });
  if (!(tables instanceof Map) || !Array.isArray(layout?.boxes)) return fail();
  for (const entry of tables.values()) {
    if (!entry || typeof entry !== 'object') return fail();
    const { table, margins } = entry;
    const collected = tableCollisionFootprints(table, layout, margins, content);
    if (collected.state !== 'collected') return collected;
    for (const footprint of collected.footprints) {
      const boxes = layout.boxes.filter(
        (box) =>
          box.section === table.section &&
          box.tableNode === table.tableNode &&
          box.pageOrdinal === footprint.pageOrdinal,
      );
      const paper = boxes[0]?.referenceBoxes?.paper,
        rectangle = footprint.rectangle;
      if (
        !paper ||
        ![
          paper.x,
          paper.y,
          paper.width,
          paper.height,
          paper.x + paper.width,
          paper.y + paper.height,
        ].every(Number.isFinite) ||
        paper.width <= 0 ||
        paper.height <= 0 ||
        boxes.some((box) =>
          ['x', 'y', 'width', 'height'].some(
            (key) => box.referenceBoxes?.paper?.[key] !== paper[key],
          ),
        )
      )
        return fail();
      if (
        rectangle.x < paper.x - 1e-8 ||
        rectangle.y < paper.y - 1e-8 ||
        rectangle.x + rectangle.width > paper.x + paper.width + 1e-8 ||
        rectangle.y + rectangle.height > paper.y + paper.height + 1e-8
      )
        return {
          state: 'unavailable',
          error: 'SourceInlineTablePaperOverflow',
          section: table.section,
          tableNode: table.tableNode,
          pageOrdinal: footprint.pageOrdinal,
          rectangle,
          paper,
        };
    }
  }
  return { state: 'contained' };
}
