import { layoutContent } from "./layout.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

/** Repeat an explicitly selected master group without changing body pagination. */
export function layoutMasterPageRows(paragraphs, profile, pages, measure, maxRows = 20000) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || !Array.isArray(paragraphs) || !paragraphs.length || !Array.isArray(pages) || !pages.length) return unavailable("InvalidMasterPageBounds");
  if (!profile || profile.apply !== "both" || ![profile.width, profile.height].every(value => Number.isInteger(value) && value > 0 && value <= 0xffffffff)) return unavailable("UnsupportedMasterPageProfile");
  const ids = new Set();
  let section;
  for (const row of paragraphs) {
    if (!row || !Number.isSafeInteger(row.section) || row.section < 0 || !Number.isSafeInteger(row.paragraph) || row.paragraph < 0
      || typeof row.text !== "string" || typeof row.label !== "string" || row.clipped || row.tableCell || ids.has(row.paragraph)) return unavailable("UnsupportedMasterPageParagraph");
    section ??= row.section;
    if (section !== row.section) return unavailable("UnsupportedMasterPageParagraph");
    ids.add(row.paragraph);
  }
  const width = hwpUnitPixels(profile.width), height = hwpUnitPixels(profile.height);
  const measured = layoutContent({ paragraphs, limited: false }, width, measure, maxRows, { documentBody: true });
  if (measured.limited || measured.height > height || measured.rows.length * pages.length > maxRows) return unavailable("MasterPageOverflow");
  const rows = [];
  const seenPages = new Set();
  for (const page of pages) {
    const box = page?.page;
    if (!Number.isSafeInteger(page?.ordinal) || page.ordinal < 0 || seenPages.has(page.ordinal) || !box || ![box.x, box.y, box.width, box.height].every(Number.isFinite)
      || box.width <= 0 || box.height <= 0 || width > box.width + 1e-9 || height > box.height + 1e-9) return unavailable("UnsupportedMasterPageBox");
    seenPages.add(page.ordinal);
    for (const row of measured.rows) rows.push({ ...row, x: box.x, y: box.y + row.y, pageOrdinal: page.ordinal,
      pageArea: "master_page", masterListNode: profile.list_node, referenceBoxes: { paper: page.paper, page: box, column: { ...box, width, height } } });
  }
  return { state: "placed", rows };
}
