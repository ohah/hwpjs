import { measureTableCells } from './table-cell-measurement.mjs';
import { planMeasuredCellCuts } from './table-measured-cell-cuts.mjs';
import { projectCellPageCuts } from './table-cell-page-projection.mjs';
import { pageReferenceBoxes } from './page-reference-boxes.mjs';

// Caller supplies the effective anchor and source padding; no float inference.
export function layoutCellTablePages(
  table,
  paragraphs,
  setting,
  measure,
  {
    firstOrigin,
    padding,
    paragraphFlows,
    paperOrigin = { x: 20, y: 20 },
    gap = 20,
    maxRows = 20000,
    maxPages = 2000,
  } = {},
) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (
    !firstOrigin ||
    ![firstOrigin.x, firstOrigin.y, gap].every(Number.isFinite) ||
    gap < 0 ||
    !Number.isSafeInteger(maxPages) ||
    maxPages < 1 ||
    table?.section !== setting?.section_ordinal
  )
    return unavailable('InvalidCellTablePageLayout');
  const reference = pageReferenceBoxes(setting, paperOrigin);
  if (reference.state !== 'placed') return unavailable(reference.state);
  const body = reference.boxes.page;
  if (firstOrigin.x < body.x || firstOrigin.y < body.y || firstOrigin.y > body.y + body.height)
    return unavailable('InvalidCellTablePageAnchor');
  const origin = { x: 0, y: 0 };
  const measured = measureTableCells(table, paragraphs, measure, {
    origin,
    padding,
    maxRows,
    paragraphFlows,
  });
  if (measured.state !== 'measured') return measured;
  if (firstOrigin.x + measured.grid.width > body.x + body.width + 1e-8)
    return unavailable('CellTablePageWidthOverflow');
  // The anchor is already bounded above; clamp only arithmetic roundoff.
  const firstCapacity = Math.max(0, Math.min(body.height, body.height - (firstOrigin.y - body.y)));
  const cuts = planMeasuredCellCuts(table, measured, body.height, {
    origin,
    padding,
    maxRows,
    maxPages,
    firstCapacity,
  });
  if (cuts.state !== 'planned') return cuts;
  const count = cuts.fragments.length + Number(Boolean(cuts.firstPageSkipped)),
    pages = [],
    placements = [];
  for (let ordinal = 0; ordinal < count; ordinal++) {
    const placed = pageReferenceBoxes(setting, {
      x: paperOrigin.x,
      y: paperOrigin.y + ordinal * (reference.boxes.paper.height + gap),
    });
    if (placed.state !== 'placed') return unavailable(placed.state);
    pages.push({ ordinal, section: table.section, ...placed.boxes, columns: [placed.boxes.page] });
  }
  for (let index = 0; index < cuts.fragments.length; index++) {
    const ordinal = index + Number(Boolean(cuts.firstPageSkipped)),
      page = pages[ordinal];
    placements.push({
      x: page.page.x + firstOrigin.x - body.x,
      y: ordinal === 0 ? firstOrigin.y : page.page.y,
      pageOrdinal: ordinal,
      referenceBoxes: { paper: page.paper, page: page.page, column: page.page },
    });
  }
  const projected = projectCellPageCuts(table, measured, cuts, placements, {
    origin,
    padding,
    maxRows,
    maxFragments: maxPages,
  });
  if (projected.state !== 'placed') return projected;
  return {
    ...projected,
    pages,
    height: pages.at(-1).paper.y + pages.at(-1).paper.height,
    pageLayoutMode: 'measured-body',
  };
}
