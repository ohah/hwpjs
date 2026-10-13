import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { rowTextTop } from "./row-geometry.mjs";

// Current measured text bounds; source line caches and parent height are not used.
export function nestedParagraphReference(paragraph, flow, origin) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Array.isArray(flow?.rows) || flow.limited === true || !origin || ![origin.x, origin.y].every(Number.isFinite)) return unavailable("MissingNestedParagraphReference");
  const rows = flow.rows.filter(row => row?.kind === "text" && row.section === paragraph?.section && row.paragraph === paragraph?.paragraph);
  if (pageParagraphCoverage([paragraph], rows).state !== "complete") return unavailable("IncompleteNestedParagraphReference");
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const page = rows[0]?.pageOrdinal, column = rows[0]?.columnOrdinal;
  for (const row of rows) {
    if (row.transform !== undefined || row.pageClip !== undefined || row.pageOrdinal !== page || row.columnOrdinal !== column) return unavailable("UnsupportedNestedParagraphReference");
    const x = (row.x ?? 0) + (row.paragraphReferenceX ?? row.paragraphX ?? 0), y = row.y + rowTextTop(row);
    if (![x, y, row.width, row.textHeight, x + row.width, y + row.textHeight].every(Number.isFinite) || row.width <= 0 || row.textHeight <= 0) return unavailable("MissingNestedParagraphReference");
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + row.width); bottom = Math.max(bottom, y + row.textHeight);
  }
  const rectangle = { section: paragraph.section, paragraph: paragraph.paragraph, x: origin.x + left, y: origin.y + top, width: right - left, height: bottom - top };
  if (![rectangle.x, rectangle.y, rectangle.width, rectangle.height, rectangle.x + rectangle.width, rectangle.y + rectangle.height].every(Number.isFinite) || rectangle.width <= 0 || rectangle.height <= 0) return unavailable("MissingNestedParagraphReference");
  return { state: "referenced", rectangle };
}
