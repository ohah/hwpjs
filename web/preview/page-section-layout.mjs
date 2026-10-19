import { sectionObjectContent } from "./section-object-content.mjs";
import { moveSectionBox, moveSectionRow, moveSectionPlacement } from "./section-layout-offset.mjs";

// Join independently laid-out sections without changing their source identities.
export function layoutPageSections(content, measure, maxRows, layoutSection) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("InvalidPageFlowBounds");
  if (!Array.isArray(content?.pageSettings) || !Array.isArray(content.paragraphs)
    || content.paragraphFlows !== undefined && !Array.isArray(content.paragraphFlows)
    || typeof layoutSection !== "function" || typeof measure !== "function") return unavailable("InvalidSectionLayoutSources");
  const settings = new Map();
  for (const setting of content.pageSettings) {
    const section = setting?.section_ordinal;
    if (!Number.isSafeInteger(section) || section < 0 || settings.has(section)) return unavailable("AmbiguousPageSettings");
    settings.set(section, setting);
  }
  if (content.paragraphs.some(row => !row || !settings.has(row.section)) || content.paragraphFlows?.some(row => !row || !settings.has(row.section))) return unavailable("UnsupportedPageSections");
  const rows = [], pages = [], overflow = [];
  const placements = {};
  let areaPolicy;
  let height = 20, limited = Boolean(content.limited);
  const moveBox = moveSectionBox;
  for (const [section, setting] of [...settings].sort(([a], [b]) => a - b)) {
    if (rows.length >= maxRows) { limited = true; break; }
    let scoped;
    try { scoped = sectionObjectContent(content, section, settings); }
    catch (error) { return unavailable(error.message); }
    const part = layoutSection({ ...scoped,
      limited: false,
      paragraphs: content.paragraphs.filter(row => row.section === section),
      paragraphFlows: content.paragraphFlows?.filter(row => row.section === section),
      pageSettings: [setting],
    }, measure, maxRows - rows.length);
    if (!part) return unavailable("InvalidSectionLayout");
    if (part.state !== "paginated") return part;
    if (!Array.isArray(part.pages) || !Array.isArray(part.rows) || !Number.isFinite(part.height) || part.height < 0
      || part.rows.length > maxRows - rows.length
      || part.pages.some((page, index) => !page || page.ordinal !== index || page.section !== undefined && page.section !== section
        || !page.paper || !page.page || !Array.isArray(page.columns) || page.columns.some(box => !box))
      || part.rows.some(row => !row || row.section !== section || !Number.isSafeInteger(row.pageOrdinal) || row.pageOrdinal < 0 || row.pageOrdinal >= part.pages.length)) return unavailable("InvalidSectionLayout");
    if (part.pageAreaSelectionPolicy !== undefined) {
      if (typeof part.pageAreaSelectionPolicy !== "string" || !part.pageAreaSelectionPolicy.length) return unavailable("InvalidSectionPageAreaPolicy");
      if (areaPolicy !== undefined && areaPolicy !== part.pageAreaSelectionPolicy) return unavailable("ConflictingSectionPageAreaPolicy");
      areaPolicy = part.pageAreaSelectionPolicy;
    }
    if (pages.length + part.pages.length > 2000) return unavailable("PageFlowLimit");
    const offset = pages.length ? height : 0;
    const ordinal = pages.length;
    try {
      for (const page of part.pages) pages.push({ ...page, section, ordinal: ordinal + page.ordinal,
        paper: moveBox(page.paper, offset), page: moveBox(page.page, offset),
        columns: page.columns.map(box => moveBox(box, offset)),
        ...(page.header ? { header: moveBox(page.header, offset) } : {}),
        ...(page.footer ? { footer: moveBox(page.footer, offset) } : {}),
      });
      for (const row of part.rows) rows.push(moveSectionRow(row, offset, ordinal));
      for (const key of ["placedDrawings", "flowPictures", "pageNumberGlyphs", "boxes", "tableAnchors", "tableCollisionFootprints", "tableCollisionFootprintErrors", "tableColumnEvidence", "tableCaptionBounds", "pageAreaDeclarationPages"]) {
        if (!part[key]) continue;
        if (!Array.isArray(part[key]) || part[key].some(item => !item || item.section !== undefined && item.section !== section)) return unavailable("InvalidSectionLayout");
        (placements[key] ??= []).push(...part[key].map(item => key === "boxes" ? moveSectionRow(item, offset, ordinal) : moveSectionPlacement(item, offset, ordinal)));
      }
    } catch (error) { return unavailable(error.message); }
    try { for (const item of part.pageAreaOverflow ?? []) {
      if (!item || item.section !== undefined && item.section !== section) return unavailable("InvalidSectionLayout");
      overflow.push({ ...moveSectionPlacement(item, offset, ordinal), section });
    } }
    catch (error) { return unavailable(error.message); }
    if (part.pages.length) height = Math.max(height, part.height + offset);
    limited ||= part.limited;
    if (part.limited) break;
  }
  return { state: "paginated", rows, pages, height, limited, spatialRows: true, pageLayoutMode: "measured-body", ...placements,
    ...(areaPolicy !== undefined ? { pageAreaSelectionPolicy: areaPolicy } : {}), ...(overflow.length ? { pageAreaOverflow: overflow } : {}) };
}
