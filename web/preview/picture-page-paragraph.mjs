import { measurePicturePageTextLine } from "./picture-page-text-line.mjs";
import { graphemeUnits } from "./text-input.mjs";
import { paragraphLineProbeHeight } from "./paragraph-line-probe-height.mjs";
import { DEFAULT_ROW_HEIGHT } from "./row-geometry.mjs";

// 호출자가 확정한 페이지/단 영역에서 문단을 소비합니다. 다음 페이지는 호출자가 소유합니다.
export function layoutPicturePageParagraph(
  paragraph,
  startUnit,
  column,
  pageOrdinal,
  reservations,
  measure,
  { maxRows = 20000, pageHeight = column?.height, minimumRowPage } = {},
) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (
    !paragraph ||
    typeof paragraph.text !== "string" ||
    paragraph.clipped ||
    !Number.isSafeInteger(startUnit) ||
    !graphemeUnits(paragraph.text).includes(startUnit)
  )
    return unavailable("InvalidPicturePageParagraphStart");
  if (
    !Number.isSafeInteger(pageOrdinal) ||
    pageOrdinal < 0 ||
    !Array.isArray(reservations) ||
    typeof measure !== "function"
  )
    return unavailable("InvalidPicturePageParagraph");
  if (
    !column ||
    ![column.x, column.y, column.width, column.height, column.y + column.height].every(
      Number.isFinite,
    ) ||
    column.width <= 0 ||
    column.height <= 0 ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return unavailable("InvalidPicturePageParagraph");
  const rows = [],
    bottom = column.y + column.height;
  if (!Number.isFinite(pageHeight) || pageHeight < column.height)
    return unavailable("InvalidPicturePageParagraph");
  if (minimumRowPage !== undefined && typeof minimumRowPage !== "function")
    return unavailable("InvalidPicturePageParagraph");
  const probe = (unit) =>
    paragraphLineProbeHeight(
      paragraph.paragraphShape,
      (text, at) => measure(text, paragraph, at, "text"),
      unit,
      DEFAULT_ROW_HEIGHT,
    );
  // A short remainder is not an oversized line: the caller owns page advance.
  if (pageHeight < probe(startUnit)) return unavailable("PicturePageParagraphHeightOverflow");
  let unit = startUnit,
    y = column.y;
  while (true) {
    if (rows.length >= maxRows) return unavailable("PicturePageParagraphRowLimit");
    const height = probe(unit);
    if (y + height > bottom) return { state: "continued", rows, endUnit: unit, nextY: y };
    const result = measurePicturePageTextLine(
      paragraph,
      unit,
      { ...column, y, height },
      pageOrdinal,
      reservations,
      measure,
    );
    if (result.state !== "available") return result;
    for (const row of result.rows) {
      const minimum = minimumRowPage?.(row) ?? 0;
      if (!Number.isSafeInteger(minimum) || minimum < 0)
        return unavailable("InvalidPicturePageMinimum");
      if (pageOrdinal < minimum) return { state: "continued", rows, endUnit: unit, nextY: y };
    }
    if (result.height > pageHeight) return unavailable("PicturePageParagraphHeightOverflow");
    if (y + result.height > bottom) return { state: "continued", rows, endUnit: unit, nextY: y };
    if (!result.rows.length) {
      if (!Number.isFinite(result.nextY) || result.nextY <= y)
        return {
          ...unavailable("PicturePageParagraphNoProgress"),
          section: paragraph.section,
          paragraph: paragraph.paragraph,
          startUnit: unit,
          currentY: y,
          nextY: result.nextY,
        };
      y = result.nextY;
      continue;
    }
    if (rows.length + result.rows.length > maxRows)
      return unavailable("PicturePageParagraphRowLimit");
    rows.push(...result.rows.map((row) => ({ ...row, pageOrdinal })));
    y += result.height;
    if (result.complete) return { state: "complete", rows, endUnit: result.endUnit, nextY: y };
    if (result.endUnit <= unit) return unavailable("PicturePageParagraphNoProgress");
    unit = result.endUnit;
  }
}
