import { inlinePictureRowPlacement } from "./inline-picture-row-placement.mjs";
import { layoutInlineTablePageContent } from "./inline-table-page-content.mjs";
import { affineBox } from "./affine-point-geometry.mjs";
import { tableCollisionFootprints } from "./table-collision-footprints.mjs";

// Project table cells in drawing-local coordinates, then apply exactly the
// drawing text transform. Native table parent identities remain unchanged.
export function projectInlineDrawingTables(measured, text, placement, maxRows) {
  const fail = (error) => ({ state: "unavailable", error });
  const rows = [...text.rows],
    boxes = [],
    tableAnchors = [],
    footprints = [];
  const matrix = text.transform ?? [1, 0, 0, 1, placement.rectangle.x, placement.rectangle.y];
  for (const entry of measured.inlineTables ?? []) {
    const { table, object } = entry;
    const matches = measured.text.rows.filter(
      (r) =>
        r.section === table.section &&
        r.paragraph === table.hostParagraph &&
        r.startUnit <= table.anchorUnit &&
        table.anchorUnit < r.endUnit,
    );
    if (matches.length !== 1) return fail("AmbiguousDrawingOwnedTableAnchor");
    const row = { ...matches[0], transform: undefined };
    const local = inlinePictureRowPlacement(
      {
        picture: {
          section: table.section,
          paragraph: table.hostParagraph,
          anchorUnit: table.anchorUnit,
        },
        width: object.width,
        height: object.height,
      },
      row,
      0,
    );
    if (local.state !== "placed") return local;
    const available = maxRows - rows.length;
    if (available < 1) return fail("DrawingTextLayoutLimit");
    const projected = layoutInlineTablePageContent(
      table,
      entry.measured,
      {
        ...placement,
        objectNode: table.tableNode,
        section: table.section,
        paragraph: table.hostParagraph,
        unit: table.anchorUnit,
        rectangle: local.rectangle,
      },
      object.outerInsets,
      { maxRows: available },
    );
    if (projected.state !== "placed") return projected;
    if (
      projected.rows.some((r) => r.transform !== undefined) ||
      projected.flowPictures?.length ||
      projected.placedDrawings?.length
    )
      return fail("UnsupportedDrawingOwnedTableObjects");
    const ownBoxes = projected.boxes.map((box) => {
      const physical = affineBox(matrix, box);
      return physical
        ? {
            ...box,
            ...physical,
            positionOwnerDrawingNode: measured.drawingNode,
            referenceBoxes: placement.referenceBoxes,
          }
        : null;
    });
    if (ownBoxes.some((box) => !box)) return fail("InvalidDrawingOwnedTableTransform");
    rows.push(
      ...projected.rows.map((r) => ({
        ...r,
        drawingNode: measured.drawingNode,
        transform: [...matrix],
        referenceBoxes: placement.referenceBoxes,
      })),
    );
    boxes.push(...ownBoxes);
    tableAnchors.push({
      section: table.section,
      tableNode: table.tableNode,
      hostParagraph: table.hostParagraph,
      anchorUnit: table.anchorUnit,
    });
    const margins = {
      left: object.outerInsets.left * matrix[0],
      right: object.outerInsets.right * matrix[0],
      top: object.outerInsets.top * matrix[3],
      bottom: object.outerInsets.bottom * matrix[3],
    };
    const collision = tableCollisionFootprints(table, { boxes: ownBoxes }, margins);
    if (collision.state !== "collected") return collision;
    footprints.push(...collision.footprints);
  }
  return {
    ...text,
    rows,
    boxes,
    tableAnchors,
    inlineTableFootprints: footprints,
    inlineTableSources: (measured.inlineTables ?? []).map((e) => e.table),
  };
}
