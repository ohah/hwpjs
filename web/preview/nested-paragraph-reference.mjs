import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { rowTextTop } from "./row-geometry.mjs";

// Current measured text bounds; source line caches and parent height are not used.
export function nestedParagraphReference(paragraph, flow, origin, instance) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (
    !Array.isArray(flow?.rows) ||
    flow.limited === true ||
    !origin ||
    ![origin.x, origin.y].every(Number.isFinite)
  )
    return unavailable("MissingNestedParagraphReference");
  const allRows = flow.rows.filter(
    (row) =>
      row?.kind === "text" &&
      row.section === paragraph?.section &&
      row.paragraph === paragraph?.paragraph,
  );
  if (pageParagraphCoverage([paragraph], allRows).state !== "complete")
    return unavailable("IncompleteNestedParagraphReference");
  if (
    instance !== undefined &&
    (!Number.isSafeInteger(instance?.pageOrdinal) ||
      instance.pageOrdinal < 0 ||
      (instance.columnOrdinal !== undefined &&
        (!Number.isSafeInteger(instance.columnOrdinal) || instance.columnOrdinal < 0)))
  )
    return unavailable("UnsupportedNestedParagraphReference");
  const rows =
    instance === undefined
      ? allRows
      : allRows.filter(
          (row) =>
            row.pageOrdinal === instance.pageOrdinal &&
            row.columnOrdinal === instance.columnOrdinal,
        );
  if (!rows.length) return unavailable("MissingNestedParagraphReference");
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity,
    anchorTop;
  const page = rows[0]?.pageOrdinal,
    column = rows[0]?.columnOrdinal;
  for (const row of rows) {
    if (
      row.transform !== undefined ||
      row.pageClip !== undefined ||
      row.pageOrdinal !== page ||
      row.columnOrdinal !== column
    )
      return unavailable("UnsupportedNestedParagraphReference");
    const width = row.paragraphReferenceWidth ?? row.width;
    const x = (row.x ?? 0) + (row.paragraphReferenceX ?? row.paragraphX ?? 0),
      y = row.y + rowTextTop(row);
    if (
      ![x, y, width, row.textHeight, x + width, y + row.textHeight].every(Number.isFinite) ||
      width <= 0 ||
      row.textHeight <= 0
    )
      return unavailable("MissingNestedParagraphReference");
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + width);
    bottom = Math.max(bottom, y + row.textHeight);
    if (row.paragraphReferenceYOffset !== undefined) {
      const value = row.y + row.paragraphReferenceYOffset;
      if (
        !Number.isFinite(row.paragraphReferenceYOffset) ||
        !Number.isFinite(value) ||
        value > y ||
        (anchorTop !== undefined && Math.abs(anchorTop - value) > 1e-8)
      )
        return unavailable("UnsupportedNestedParagraphReference");
      anchorTop = value;
    }
  }
  if (anchorTop !== undefined) {
    if (rows.some((row) => row.paragraphReferenceYOffset === undefined))
      return unavailable("UnsupportedNestedParagraphReference");
    top = anchorTop;
  }
  const rectangle = {
    section: paragraph.section,
    paragraph: paragraph.paragraph,
    x: origin.x + left,
    y: origin.y + top,
    width: right - left,
    height: bottom - top,
  };
  if (
    ![
      rectangle.x,
      rectangle.y,
      rectangle.width,
      rectangle.height,
      rectangle.x + rectangle.width,
      rectangle.y + rectangle.height,
    ].every(Number.isFinite) ||
    rectangle.width <= 0 ||
    rectangle.height <= 0
  )
    return unavailable("MissingNestedParagraphReference");
  return { state: "referenced", rectangle };
}
