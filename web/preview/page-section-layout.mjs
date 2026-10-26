import { sectionObjectContent } from './section-object-content.mjs';
import { moveSectionBox, moveSectionRow, moveSectionPlacement } from './section-layout-offset.mjs';

// Join independently laid-out sections without changing their source identities.
export function layoutPageSections(content, measure, maxRows, layoutSection) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable('InvalidPageFlowBounds');
  if (
    !Array.isArray(content?.pageSettings) ||
    !Array.isArray(content.paragraphs) ||
    (content.paragraphFlows !== undefined && !Array.isArray(content.paragraphFlows)) ||
    typeof layoutSection !== 'function' ||
    typeof measure !== 'function'
  )
    return unavailable('InvalidSectionLayoutSources');
  const settings = new Map();
  for (const setting of content.pageSettings) {
    const section = setting?.section_ordinal;
    if (!Number.isSafeInteger(section) || section < 0 || settings.has(section))
      return unavailable('AmbiguousPageSettings');
    settings.set(section, setting);
  }
  if (
    content.paragraphs.some((row) => !row || !settings.has(row.section)) ||
    content.paragraphFlows?.some((row) => !row || !settings.has(row.section))
  )
    return unavailable('UnsupportedPageSections');
  const rows = [],
    pages = [],
    overflow = [];
  const placements = {};
  let areaPolicy;
  let height = 20,
    limited = Boolean(content.limited),
    createdTablesPaginated = false;
  const createdCellParagraphs = [];
  const moveBox = moveSectionBox;
  // Measure each section once; retain its local scene until all paper extents are known.
  const parts = [];
  let usedRows = 0,
    pageCount = 0;
  let left = Infinity,
    right = -Infinity;
  for (const [section, setting] of [...settings].sort(([a], [b]) => a - b)) {
    if (usedRows >= maxRows) {
      limited = true;
      break;
    }
    let scoped;
    try {
      scoped = sectionObjectContent(content, section, settings);
    } catch (error) {
      return unavailable(error.message);
    }
    const part = layoutSection(
      {
        ...scoped,
        limited: false,
        paragraphs: content.paragraphs.filter((row) => row.section === section),
        paragraphFlows: content.paragraphFlows?.filter((row) => row.section === section),
        pageSettings: [setting],
      },
      measure,
      maxRows - usedRows,
    );
    if (!part) return unavailable('InvalidSectionLayout');
    if (part.state !== 'paginated') return part;
    if (
      part.createdTablesPaginated !== undefined &&
      typeof part.createdTablesPaginated !== 'boolean'
    )
      return unavailable('InvalidSectionLayout');
    createdTablesPaginated ||= part.createdTablesPaginated === true;
    if (part.createdCellParagraphs !== undefined) {
      if (
        part.createdTablesPaginated !== true ||
        !Array.isArray(part.createdCellParagraphs) ||
        part.createdCellParagraphs.some(
          (row) => !row || row.section !== section || !row.createdCell,
        )
      )
        return unavailable('InvalidSectionLayout');
      createdCellParagraphs.push(...part.createdCellParagraphs);
    }
    if (
      !Array.isArray(part.pages) ||
      !Array.isArray(part.rows) ||
      !Number.isFinite(part.height) ||
      part.height < 0 ||
      part.rows.length + (part.repeatedTableHeaderRows?.length ?? 0) > maxRows - usedRows ||
      part.pages.some(
        (page, index) =>
          !page ||
          page.ordinal !== index ||
          (page.section !== undefined && page.section !== section) ||
          !page.paper ||
          !page.page ||
          !Array.isArray(page.columns) ||
          page.columns.some((box) => !box),
      ) ||
      part.rows.some(
        (row) =>
          !row ||
          row.section !== section ||
          !Number.isSafeInteger(row.pageOrdinal) ||
          row.pageOrdinal < 0 ||
          row.pageOrdinal >= part.pages.length,
      )
    )
      return unavailable('InvalidSectionLayout');
    if (part.pageAreaSelectionPolicy !== undefined) {
      if (typeof part.pageAreaSelectionPolicy !== 'string' || !part.pageAreaSelectionPolicy.length)
        return unavailable('InvalidSectionPageAreaPolicy');
      if (areaPolicy !== undefined && areaPolicy !== part.pageAreaSelectionPolicy)
        return unavailable('ConflictingSectionPageAreaPolicy');
      areaPolicy = part.pageAreaSelectionPolicy;
    }
    if (pageCount + part.pages.length > 2000) return unavailable('PageFlowLimit');
    for (const key of [
      'placedDrawings',
      'placedContainers',
      'flowPictures',
      'groupReservations',
      'pageNumberGlyphs',
      'boxes',
      'tableAnchors',
      'flowAnchors',
      'tableCollisionFootprints',
      'tableCollisionFootprintErrors',
      'tableColumnEvidence',
      'tableCaptionBounds',
      'pageAreaDeclarationPages',
      'hostNumberPrefixes',
      'repeatedTableHeaderRows',
      'repeatedTableHeaderBoxes',
      'noteSeparators',
      'pageAreaOverflow',
    ]) {
      if (!part[key]) continue;
      if (
        !Array.isArray(part[key]) ||
        part[key].some((item) => !item || (item.section !== undefined && item.section !== section))
      )
        return unavailable('InvalidSectionLayout');
    }
    let center;
    for (const { paper } of part.pages) {
      const edge = paper.x + paper.width;
      const nextCenter = paper.x + paper.width / 2;
      if (
        ![
          paper.x,
          paper.y,
          paper.width,
          paper.height,
          edge,
          nextCenter,
          paper.y + paper.height,
        ].every(Number.isFinite) ||
        paper.width <= 0 ||
        paper.height <= 0
      )
        return unavailable('InvalidSectionLayout');
      if (center !== undefined && Math.abs(center - nextCenter) > 1e-7)
        return unavailable('UnsupportedSectionPaperCenters');
      center = nextCenter;
      left = Math.min(left, paper.x);
      right = Math.max(right, edge);
    }
    parts.push({ section, part, center });
    usedRows += part.rows.length + (part.repeatedTableHeaderRows?.length ?? 0);
    pageCount += part.pages.length;
    limited ||= part.limited;
    if (part.limited) break;
  }
  // Use validated world paper bounds, including their origins, rather than settings or a viewport.
  const sceneCenter = pageCount ? left / 2 + right / 2 : 0;
  for (const { section, part, center } of parts) {
    const xOffset = center === undefined ? 0 : sceneCenter - center;
    const offset = pages.length ? height : 0;
    const ordinal = pages.length;
    try {
      for (const page of part.pages)
        pages.push({
          ...page,
          section,
          ordinal: ordinal + page.ordinal,
          paper: moveBox(page.paper, offset, xOffset),
          page: moveBox(page.page, offset, xOffset),
          columns: page.columns.map((box) => moveBox(box, offset, xOffset)),
          ...(page.header ? { header: moveBox(page.header, offset, xOffset) } : {}),
          ...(page.footer ? { footer: moveBox(page.footer, offset, xOffset) } : {}),
        });
      for (const row of part.rows) rows.push(moveSectionRow(row, offset, ordinal, xOffset));
      for (const key of [
        'placedDrawings',
        'placedContainers',
        'flowPictures',
        'groupReservations',
        'pageNumberGlyphs',
        'boxes',
        'tableAnchors',
        'flowAnchors',
        'tableCollisionFootprints',
        'tableCollisionFootprintErrors',
        'tableColumnEvidence',
        'tableCaptionBounds',
        'pageAreaDeclarationPages',
        'hostNumberPrefixes',
        'repeatedTableHeaderRows',
        'repeatedTableHeaderBoxes',
        'noteSeparators',
      ]) {
        if (!part[key]) continue;
        if (
          !Array.isArray(part[key]) ||
          part[key].some(
            (item) => !item || (item.section !== undefined && item.section !== section),
          )
        )
          return unavailable('InvalidSectionLayout');
        if (
          key === 'flowAnchors' &&
          part[key].some(
            (item) =>
              item.kind !== 'anchor' ||
              item.section !== section ||
              item.height !== 0 ||
              !Number.isSafeInteger(item.pageOrdinal) ||
              item.pageOrdinal < 0 ||
              item.pageOrdinal >= part.pages.length,
          )
        )
          return unavailable('InvalidSectionLayout');
        (placements[key] ??= []).push(
          ...part[key].map((item) =>
            ['boxes', 'repeatedTableHeaderRows', 'repeatedTableHeaderBoxes'].includes(key)
              ? moveSectionRow(item, offset, ordinal, xOffset)
              : moveSectionPlacement(item, offset, ordinal, xOffset),
          ),
        );
      }
    } catch (error) {
      return unavailable(error.message);
    }
    try {
      for (const item of part.pageAreaOverflow ?? []) {
        if (!item || (item.section !== undefined && item.section !== section))
          return unavailable('InvalidSectionLayout');
        overflow.push({ ...moveSectionPlacement(item, offset, ordinal, xOffset), section });
      }
    } catch (error) {
      return unavailable(error.message);
    }
    if (part.pages.length) height = Math.max(height, part.height + offset);
    limited ||= part.limited;
    if (part.limited) break;
  }
  return {
    state: 'paginated',
    rows,
    pages,
    height,
    limited,
    spatialRows: true,
    pageLayoutMode: 'measured-body',
    ...placements,
    ...(createdTablesPaginated ? { createdTablesPaginated, createdCellParagraphs } : {}),
    ...(areaPolicy !== undefined ? { pageAreaSelectionPolicy: areaPolicy } : {}),
    ...(overflow.length ? { pageAreaOverflow: overflow } : {}),
  };
}
