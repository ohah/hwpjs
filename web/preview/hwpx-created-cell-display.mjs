import { hwpxParagraphGeometry } from './hwpx-paragraph-geometry.mjs';
import { sourceTableCellInsets } from './table-source-insets.mjs';

// HWPX created_table_xml writes hasMargin=0 and zero table inMargin.
// The independent saved-XML test guards this fixed authoring contract.
export function hwpxCreatedCellDisplay(table, shapes) {
  const shape = shapes?.find((shape) => shape.id === table.resources.paragraph);
  if (!shape) return {};
  const insets = sourceTableCellInsets(
    { sourceGeometry: { in_margin: [0, 0, 0, 0] } },
    { sourceMargin: { has_margin: false } },
  );
  return {
    displayFormat: 'hwpx',
    displayParagraphShape: hwpxParagraphGeometry(shape),
    displayInsets: insets,
  };
}
