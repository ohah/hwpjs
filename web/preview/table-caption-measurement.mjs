import { layoutContent } from './layout.mjs';
import { squeezeCaptionRow } from './caption-squeeze-row.mjs';

/** Measure current caption text at an explicitly resolved pixel width. */
export function measureTableCaption(
  table,
  paragraphs,
  measure,
  { width, maxRows = 20000, squeeze = false } = {},
) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (
    !table?.sourceCaption ||
    !Array.isArray(table.captionParagraphs) ||
    !Array.isArray(paragraphs) ||
    typeof measure !== 'function' ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return unavailable('InvalidTableCaptionMeasurement');
  if (table.partial) return unavailable('IncompleteTableCaptionContent');
  const members = new Map();
  for (const paragraph of paragraphs) {
    const key = `${paragraph.section}:${paragraph.paragraph}`;
    if (members.has(key)) return unavailable('AmbiguousTableCaptionParagraph');
    members.set(key, paragraph);
  }
  const selected = [],
    seen = new Set();
  for (const id of table.captionParagraphs) {
    const paragraph = members.get(`${table.section}:${id}`);
    const owner = paragraph?.tableCaption;
    if (
      seen.has(id) ||
      !paragraph ||
      paragraph.clipped ||
      owner?.tableNode !== table.tableNode ||
      owner.captionNode !== table.sourceCaption?.caption_node ||
      owner.listNode !== table.sourceCaption?.list_node ||
      paragraph.tableCell
    )
      return unavailable('AmbiguousTableCaptionParagraph');
    seen.add(id);
    selected.push(paragraph);
  }
  const flow = layoutContent({ paragraphs: selected, limited: false }, width, measure, maxRows, {
    documentBody: true,
    noWrap: squeeze,
  });
  if (flow.limited) return unavailable('TableCaptionMeasurementLimit');
  const rows = [];
  for (const source of flow.rows) {
    const row = squeeze ? squeezeCaptionRow(source) : source;
    if (!row) return unavailable('UnsupportedTableCaptionSqueezeWidth');
    rows.push({
      ...row,
      tableNode: table.tableNode,
      captionNode: table.sourceCaption.caption_node,
      listNode: table.sourceCaption.list_node,
    });
  }
  return { state: 'measured', width, height: flow.height, rows };
}
