// Observation of the existing engine, never a save authorization or fallback.
import { layoutContent } from './layout.mjs';
import { paginateBodyRows } from './page-row-flow.mjs';
import { pageReferenceBoxes } from './page-reference-boxes.mjs';

export function observeHwp5LayoutForSave(content, width, measure, maxRows = 20000) {
  if (content.format !== 'hwp5') throw Error('ExpectedHwp5Layout');
  const flow = layoutContent(content, width, measure, maxRows, { documentBody: true });
  const paragraphs = new Map();
  for (const p of content.paragraphs) {
    if (p.clipped || (p.textStartUnit ?? 0) !== 0) throw Error('UnsupportedPartialLayoutSource');
    const key = `${p.section}:${p.paragraph}`;
    if (paragraphs.has(key)) throw Error('DuplicateLayoutOwner');
    paragraphs.set(key, p);
  }
  const rows = [];
  for (const row of flow.rows) {
    if (row.kind !== 'text') continue;
    const p = paragraphs.get(`${row.section}:${row.paragraph}`);
    const start = p?.sourceOffsets?.[row.startUnit],
      end = p?.sourceOffsets?.[row.endUnit];
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start)
      throw Error('MissingLayoutSourceBoundary');
    rows.push({
      section: row.section,
      paragraph: row.paragraph,
      start,
      end,
      logicalY: row.y,
      advance: row.height,
      textHeight: row.textHeight,
      availableWidth: row.width,
      x: row.paragraphX,
    });
  }
  return {
    kind: 'hwp5-layout-save-observation',
    rows,
    limited: flow.limited,
    unresolved: [
      ...(flow.limited ? ['limited-output'] : []),
      'approximate-grapheme-shaping',
      'measured-baseline-and-line-box',
      'page-flow-local-coordinates',
      'native-owner-and-font-environment-binding',
    ],
  };
}

/** Uses existing page flow; keeps real column-local coordinates, not viewport y.
 * Pixel observations remain observations until baseline/line-box and producer
 * qualification are carried by the engine and bound to the native owner.
 */
export function observeHwp5PageLayoutForSave(
  content,
  measure,
  setting,
  paragraphFlows,
  maxRows = 20000,
) {
  if (content.format !== 'hwp5') throw Error('ExpectedHwp5Layout');
  if (content.paragraphs.some((p) => p.clipped || (p.textStartUnit ?? 0) !== 0))
    throw Error('UnsupportedPartialLayoutSource');
  const reference = pageReferenceBoxes(setting, { x: 0, y: 0 });
  if (reference.state !== 'placed') throw Error('UnsupportedLayoutPageGeometry');
  const logical = layoutContent(content, reference.boxes.page.width, measure, maxRows, {
    documentBody: true,
  });
  const flow = paginateBodyRows(logical.rows, setting, paragraphFlows, {
    x: 0,
    y: 0,
    gap: 0,
    maxRows,
  });
  if (flow.state !== 'paginated') throw Error(flow.error ?? 'UnpaginatedLayout');
  const byOwner = new Map(content.paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p]));
  if (byOwner.size !== content.paragraphs.length) throw Error('DuplicateLayoutOwner');
  const rows = [];
  for (const row of flow.rows) {
    if (row.kind !== 'text') continue;
    const p = byOwner.get(`${row.section}:${row.paragraph}`);
    const start = p?.sourceOffsets?.[row.startUnit],
      end = p?.sourceOffsets?.[row.endUnit];
    const column = row.referenceBoxes?.column;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start)
      throw Error('MissingLayoutSourceBoundary');
    if (
      !column ||
      !Number.isSafeInteger(row.pageOrdinal) ||
      ![row.y - column.y, row.paragraphX, row.height, row.textHeight].every(Number.isFinite)
    )
      throw Error('MissingLayoutPagePlacement');
    rows.push({
      section: row.section,
      paragraph: row.paragraph,
      start,
      end,
      page: row.pageOrdinal,
      column: row.columnOrdinal,
      localY: row.y - column.y,
      x: row.paragraphX,
      advance: row.height,
      textHeight: row.textHeight,
      availableWidth: row.width,
    });
  }
  return {
    kind: 'hwp5-page-layout-save-observation',
    rows,
    pages: flow.pages.map((page) => ({
      ordinal: page.ordinal,
      paper: { ...page.paper },
      body: { ...page.page },
    })),
    limited: logical.limited || flow.limited,
    unresolved: [
      'approximate-grapheme-shaping',
      'measured-baseline-and-line-box',
      'native-owner-and-font-environment-binding',
      'hwp5-page-flow-serialization-qualification',
    ],
  };
}
