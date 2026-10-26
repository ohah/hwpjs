import { nestedParagraphReference } from './nested-paragraph-reference.mjs';
import { placeMeasuredNestedFloatingTable } from './nested-floating-display-height.mjs';
import { tableLineRegions } from './table-line-regions.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';

// TOP_AND_BOTTOM never changes available line width: retain the original line
// breaks and advance each whole line past the occupied vertical interval.
// The paragraph anchor remains at its original current-layout origin, even
// when the first text line has to move below the table.
export function flowNestedBlockText(paragraph, flow, entries, width) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (typeof paragraph?.text !== 'string' || !Array.isArray(entries) || !Array.isArray(flow?.rows))
    return fail('InvalidNestedBlockTextFlow');
  if (entries.length !== 1 || flow.anchors?.length) return { state: 'unchanged', flow };
  const table = entries[0]?.table,
    source = table?.sourceGeometry;
  if (
    source?.text_wrap !== 1 ||
    source.vertical_relative !== 2 ||
    source.vertical_alignment !== 0 ||
    source.flow_with_text !== true ||
    source.allow_overlap !== false
  )
    return { state: 'unchanged', flow };
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(flow.height) || flow.height < 0)
    return fail('InvalidNestedBlockTextFlow');
  if (paragraph.text.replaceAll('\ufffc', '').trim() === '') return { state: 'unchanged', flow };
  const reference = nestedParagraphReference(paragraph, flow, { x: 0, y: 0 });
  if (reference.state !== 'referenced') return reference;
  const placed = placeMeasuredNestedFloatingTable(entries[0], {
    paragraph: reference.rectangle,
    column: { x: 0, y: 0, width, height: Math.max(flow.height, 1) },
  });
  if (placed.state !== 'placed') return { state: 'unchanged', flow };
  const rows = [];
  let advance = 0,
    moved = false,
    previousY = -Infinity;
  for (const row of flow.rows) {
    if (
      row.kind !== 'text' ||
      row.transform !== undefined ||
      row.pageClip !== undefined ||
      !Number.isFinite(row.y) ||
      row.y < previousY ||
      !Number.isFinite(row.height) ||
      row.height <= 0
    )
      return { state: 'unchanged', flow };
    previousY = row.y;
    let y = row.y + advance;
    const region = tableLineRegions(
      { x: 0, y, width, height: row.height },
      placed.rectangle,
      table,
    );
    if (region.state !== 'available') return fail('UnsupportedNestedBlockTextRegion');
    if (!region.regions.length) {
      const next =
        placed.rectangle.y + placed.rectangle.height + hwpUnitPixels(source.out_margin[3]);
      if (!Number.isFinite(next) || next <= y) return fail('InvalidNestedBlockTextAdvance');
      advance += next - y;
      y = next;
      moved = true;
    }
    if (![y, y + row.height, reference.rectangle.y - y].every(Number.isFinite))
      return fail('InvalidNestedBlockTextAdvance');
    rows.push({ ...row, y, paragraphReferenceYOffset: reference.rectangle.y - y });
  }
  if (!moved) return { state: 'unchanged', flow };
  if (!Number.isFinite(flow.height + advance)) return fail('InvalidNestedBlockTextAdvance');
  return { state: 'flowed', flow: { ...flow, rows, height: flow.height + advance } };
}
