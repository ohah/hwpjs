import { createFootnoteColumnReservation } from "./footnote-column-reservation.mjs";
import { placeFootnoteArea } from "./footnote-area-placement.mjs";
import { affineBox } from "./affine-point-geometry.mjs";
import { rowLeft } from "./row-geometry.mjs";

export function bodyPageOccupiedBottom(body, page) {
  let occupied = page?.page?.y;
  if (!Number.isFinite(occupied) || !Array.isArray(body?.rows))
    return { state: "unavailable", error: "InvalidFootnoteBodyGeometry" };
  const include = (rectangle) => {
    if (
      !rectangle ||
      !Number.isFinite(rectangle.y) ||
      !Number.isFinite(rectangle.height) ||
      rectangle.height < 0 ||
      !Number.isFinite(rectangle.y + rectangle.height)
    )
      throw Error("InvalidFootnoteBodyGeometry");
    occupied = Math.max(occupied, rectangle.y + rectangle.height);
  };
  try {
    for (const row of body.rows)
      if (row.pageOrdinal === page.ordinal)
        include(
          row.transform === undefined
            ? row
            : affineBox(row.transform, {
                x: rowLeft(row),
                y: row.y,
                width: row.width,
                height: row.height,
              }),
        );
    for (const key of ["boxes", "placedDrawings", "flowPictures", "noteAreas"]) {
      if (body[key] !== undefined && !Array.isArray(body[key]))
        throw Error("InvalidFootnoteBodyGeometry");
      for (const item of body[key] ?? [])
        if (item.pageOrdinal === page.ordinal) include(key === "boxes" ? item : item.rectangle);
    }
  } catch (error) {
    return { state: "unavailable", error: error.message };
  }
  return { state: "measured", bottom: occupied };
}

/** Project measured notes onto their proven body-reference page, never array order. */
export function projectBodyFootnotes(body, notes, policy, separator, maxRows) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    body?.state !== "paginated" ||
    body.limited ||
    !Array.isArray(body.pages) ||
    !Array.isArray(body.rows) ||
    (body.hostNumberPrefixes !== undefined && !Array.isArray(body.hostNumberPrefixes)) ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    body.rows.length > maxRows
  )
    return fail("InvalidFootnoteBodyLayout");
  const baseCount = body.rows.length + (body.hostNumberPrefixes?.length ?? 0);
  if (baseCount > maxRows) return fail("NotePageLayoutLimit");
  const reservation = createFootnoteColumnReservation(notes, policy, separator?.height);
  if (reservation.state !== "ready") return reservation;
  const rows = [],
    boxes = [],
    numberPrefixes = [],
    separators = [],
    flowPictures = [],
    seen = new Set();
  const ordinals = new Set();
  for (const page of body.pages) {
    if (
      !page ||
      !Array.isArray(page.columns) ||
      page.columns.length !== 1 ||
      !page.page ||
      ![page.page.x, page.page.y, page.page.width, page.page.height].every(Number.isFinite) ||
      !Number.isSafeInteger(page.ordinal) ||
      page.ordinal < 0 ||
      ordinals.has(page.ordinal) ||
      (page.section !== undefined && page.section !== policy.section)
    )
      return fail("UnsupportedFootnoteBodyColumns");
    ordinals.add(page.ordinal);
    const selected = reservation.notesFor(body.rows, page.ordinal, 0);
    if (!selected.length) continue;
    for (const note of selected) {
      if (seen.has(note.noteNode)) return fail("AmbiguousFootnoteBodyPage");
      seen.add(note.noteNode);
    }
    const occupied = bodyPageOccupiedBottom(body, page);
    if (occupied.state !== "measured") return occupied;
    const placed = placeFootnoteArea(
      selected,
      policy,
      page.page,
      occupied.bottom,
      separator.height,
      maxRows - baseCount - rows.length - numberPrefixes.length,
    );
    if (placed.state !== "placed") return placed;
    const project = (item) => ({
      ...item,
      pageOrdinal: page.ordinal,
      columnOrdinal: 0,
      referenceBoxes: { paper: page.paper, page: page.page, column: page.page },
    });
    rows.push(...placed.rows.map(project));
    boxes.push(...placed.boxes.map(project));
    flowPictures.push(...placed.flowPictures.map(project));
    numberPrefixes.push(
      ...placed.numberPrefixes.map((item) => ({ ...project(item), pageClip: page.page })),
    );
    if (separator.height > 0)
      separators.push({
        section: policy.section,
        x: page.page.x,
        y: placed.separatorY,
        width: separator.width,
        height: separator.height,
        color: separator.color,
        pageOrdinal: page.ordinal,
        ...(separator.bands ? { bands: separator.bands } : {}),
      });
  }
  if (seen.size !== notes.length) return fail("MissingFootnoteBodyPage");
  return { state: "projected", rows, boxes, numberPrefixes, separators, flowPictures };
}
