import { pageSequenceReference } from "./page-sequence-reference.mjs";
import { columnReferenceBoxes } from "./column-reference-boxes.mjs";
import { bodyPageOccupiedBottom } from "./body-footnote-projection.mjs";
import { affineBox } from "./affine-point-geometry.mjs";
import { rowLeft } from "./row-geometry.mjs";

// Planning-only gaps preserve the exact preceding pages/columns without copying
// their painted rows into the paginator a second time.
export function endnoteColumnPrefix(body, context, setting, paragraph, maxRows = 20000) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    context?.state !== "resolved" ||
    !Array.isArray(body?.pages) ||
    !body.pages.length ||
    !Array.isArray(body.rows) ||
    body.rows.some((row) => !row || typeof row !== "object") ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return fail("InvalidEndnoteColumnPrefix");
  const same = (a, b) =>
    a &&
    b &&
    ["x", "y", "width", "height"].every(
      (k) => Number.isFinite(a[k]) && Math.abs(a[k] - b[k]) <= 1e-8,
    );
  for (const [index, page] of body.pages.entries()) {
    const expected = pageSequenceReference(setting, index);
    const columns =
      expected.state === "placed"
        ? columnReferenceBoxes(expected.boxes.page, context.declaration)
        : null;
    if (
      !page ||
      page.ordinal !== index ||
      columns?.state !== "placed" ||
      !same(page.paper, expected.boxes.paper) ||
      !same(page.page, expected.boxes.page) ||
      page.columns?.length !== columns.boxes.length ||
      page.columns.some((box, i) => !same(box, columns.boxes[i]))
    )
      return fail("UnsupportedEndnoteColumnPages");
  }
  const page = body.pages.at(-1);
  const tail = body.rows.filter(
    (r) => r.section === context.section && r.paragraph === context.sourceParagraph,
  );
  const last = tail.at(-1);
  if (
    !last ||
    last.pageOrdinal !== page.ordinal ||
    !Number.isSafeInteger(last.columnOrdinal) ||
    last.columnOrdinal < 0 ||
    last.columnOrdinal >= page.columns.length
  )
    return fail("MissingEndnoteBodyTailColumn");
  const column = page.columns[last.columnOrdinal];
  const intersects = (box) =>
    box && box.x < column.x + column.width && box.x + box.width > column.x;
  const bounds = (r) =>
    r.transform
      ? affineBox(r.transform, { x: rowLeft(r), y: r.y, width: r.width, height: r.height })
      : { x: rowLeft(r), y: r.y, width: r.width, height: r.height };
  if (
    body.rows.some(
      (r) =>
        !Number.isFinite(r.y) ||
        !Number.isFinite(r.height) ||
        r.height < 0 ||
        (r.kind === "text" && (!bounds(r) || !Object.values(bounds(r)).every(Number.isFinite))),
    )
  )
    return fail("InvalidEndnoteColumnBodyGeometry");
  const rows = body.rows.filter(
    (r) =>
      r.pageOrdinal === page.ordinal &&
      (r.kind !== "text" ? r.columnOrdinal === last.columnOrdinal : intersects(bounds(r))),
  );
  const scoped = { rows };
  for (const key of ["boxes", "placedDrawings", "flowPictures", "noteAreas"]) {
    if (body[key] !== undefined && !Array.isArray(body[key]))
      return fail("InvalidEndnoteColumnPrefix");
    if (
      (body[key] ?? []).some((item) => {
        const box = key === "boxes" ? item : item?.rectangle;
        return (
          !box ||
          ![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(
            Number.isFinite,
          )
        );
      })
    )
      return fail("InvalidEndnoteColumnBodyGeometry");
    if (
      (body[key] ?? []).some(
        (item) =>
          item.pageOrdinal === page.ordinal &&
          page.columns.slice(last.columnOrdinal + 1).some((c) => {
            const box = key === "boxes" ? item : item.rectangle;
            return box.x < c.x + c.width && box.x + box.width > c.x;
          }),
      )
    )
      return fail("UnsupportedEndnoteForwardColumnPaint");
    scoped[key] = (body[key] ?? []).filter(
      (item) =>
        item.pageOrdinal === page.ordinal && intersects(key === "boxes" ? item : item.rectangle),
    );
  }
  const occupied = bodyPageOccupiedBottom(scoped, page);
  if (occupied.state !== "measured") return occupied;
  if (occupied.bottom > column.y + column.height + 1e-8)
    return fail("UnsupportedEndnoteBodyOverflow");
  const prefix = [];
  for (const physical of body.pages)
    for (let ordinal = 0; ordinal < physical.columns.length; ordinal++) {
      if (physical.ordinal === page.ordinal && ordinal > last.columnOrdinal) break;
      const height =
        physical.ordinal === page.ordinal && ordinal === last.columnOrdinal
          ? occupied.bottom - column.y
          : physical.columns[ordinal].height;
      if (height > 0) {
        if (prefix.length >= maxRows) return fail("NotePageLayoutLimit");
        prefix.push({
          kind: "gap",
          section: context.section,
          paragraph,
          height,
          endnoteBodyPrefix: true,
        });
      }
    }
  return {
    state: "prepared",
    rows: prefix,
    tail: { pageOrdinal: page.ordinal, columnOrdinal: last.columnOrdinal, y: occupied.bottom },
  };
}
