import { nestedParagraphReference } from './nested-paragraph-reference.mjs';
import { alignedReferenceCoordinate } from './picture-placement.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';
import { signedInt32 } from './signed-int32.mjs';
import { rowTextTop } from './row-geometry.mjs';
import { nestedFloatingDisplayHeight } from './nested-floating-display-height.mjs';

// Reserve block floats below visible host text, not behind/front overlays.
export function reserveNestedFloatingFlow(paragraph, flow, entries, origin) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  const reference = nestedParagraphReference(paragraph, flow, origin);
  if (reference.state !== 'referenced') return reference;
  if (!Array.isArray(entries) || !Number.isFinite(flow.height) || flow.height < 0)
    return unavailable('InvalidNestedFloatingFlow');
  let bottom = origin.y + flow.height;
  for (const entry of entries) {
    const table = entry?.table;
    const source = table?.sourceGeometry,
      geometry = source?.geometry;
    const unsupported = (reason) => ({
      state: 'unavailable',
      error: 'UnsupportedNestedFloatingBlockFlow',
      section: table.section,
      tableNode: table.tableNode,
      parentTableNode: table.parentTableNode,
      paragraph: paragraph.paragraph,
      nestedFlowReason: reason,
    });
    if (
      !table ||
      table.section !== paragraph.section ||
      table.hostParagraph !== paragraph.paragraph ||
      !Number.isInteger(table.anchorUnit) ||
      table.anchorUnit < 0 ||
      paragraph.text[table.anchorUnit] !== '\ufffc' ||
      ![1, 2, 3].includes(source?.text_wrap)
    )
      return unavailable('InvalidNestedFloatingFlow');
    if (source?.text_wrap !== 1) continue;
    if (source.vertical_relative !== 2) return unsupported('reference');
    if (source.vertical_alignment !== 0) return unsupported('alignment');
    if (source.flow_with_text !== true) return unsupported('flow-with-text');
    if (source.allow_overlap !== false) return unsupported('overlap');
    if (!Number.isInteger(geometry?.height) || geometry.height <= 0 || geometry.height > 0xffffffff)
      return unsupported('size');
    const offset = signedInt32(geometry.vertical_offset);
    if (offset === null) return unavailable('InvalidNestedFloatingFlow');
    const size = nestedFloatingDisplayHeight(entry);
    if (size === null) return unavailable('InvalidNestedFloatingFlow');
    const y = alignedReferenceCoordinate(
      reference.rectangle.y,
      reference.rectangle.height,
      size,
      hwpUnitPixels(offset),
      0,
    );
    if (![y, y + size].every(Number.isFinite)) return unavailable('InvalidNestedFloatingFlow');
    if (
      paragraph.text.replaceAll('\ufffc', '').trim() !== '' &&
      flow.rows.some(
        (row) =>
          row.kind === 'text' &&
          row.section === paragraph.section &&
          row.paragraph === paragraph.paragraph &&
          origin.y + row.y + rowTextTop(row) < y + size &&
          origin.y + row.y + rowTextTop(row) + row.textHeight > y,
      )
    )
      return unsupported('text-overlap');
    bottom = Math.max(bottom, y + size);
  }
  return Number.isFinite(bottom)
    ? { state: 'reserved', bottom }
    : unavailable('InvalidNestedFloatingFlow');
}
