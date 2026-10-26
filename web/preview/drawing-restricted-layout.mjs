import { restrictDrawingPlacement } from "./drawing-restricted-placement.mjs";
import { moveSectionRow } from "./section-layout-offset.mjs";
import { drawingCollisionPolicy } from "./drawing-collision-policy.mjs";

/** Move the final drawing footprint and text together in physical coordinates. */
export function restrictDrawingLayout(drawing, prepared, inventory, body) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    prepared?.state !== "placed" ||
    inventory?.state !== "collected" ||
    !Array.isArray(inventory.footprints) ||
    !Array.isArray(prepared.rows) ||
    !prepared.rectangle ||
    ![
      prepared.rectangle.x,
      prepared.rectangle.y,
      prepared.rectangle.width,
      prepared.rectangle.height,
    ].every(Number.isFinite) ||
    prepared.rectangle.width <= 0 ||
    prepared.rectangle.height <= 0
  )
    return fail("IncompleteRestrictedDrawingLayout");
  const policy = drawingCollisionPolicy(drawing?.source);
  if (policy.state !== "selected") return policy;
  const own = inventory.footprints.filter(
    (f) => f.kind === "drawing" && f.section === drawing.section && f.node === drawing.drawingNode,
  );
  if (own.length !== 1 || own[0].pageOrdinal !== prepared.pageOrdinal)
    return fail("IncompleteRestrictedDrawingLayout");
  const occupied = inventory.footprints.filter((f) => f !== own[0]);
  const result = restrictDrawingPlacement(own[0].rectangle, body, occupied, {
    section: drawing.section,
    pageOrdinal: prepared.pageOrdinal,
    restrictToBody: policy.restrictToBody,
    allowOverlap: policy.allowOverlap,
  });
  if (result.state !== "placed") return result;
  const shift = result.rectangle.y - own[0].rectangle.y;
  try {
    const rows = prepared.rows.map((row) => {
      if (
        !row ||
        row.section !== drawing.section ||
        row.pageOrdinal !== prepared.pageOrdinal ||
        !Number.isFinite(row.y)
      )
        throw new Error("AmbiguousRestrictedDrawingRows");
      const moved = moveSectionRow(row, shift, 0);
      // The physical page stays put while the drawing moves inside it.
      if (row.referenceBoxes) moved.referenceBoxes = row.referenceBoxes;
      return moved;
    });
    return {
      ...prepared,
      rectangle: { ...prepared.rectangle, y: prepared.rectangle.y + shift },
      rows,
      collisionFootprint: result.rectangle,
      restrictedShiftY: shift,
    };
  } catch (error) {
    return fail(error.message);
  }
}
