import { sourceTableCellInsets } from "./table-source-insets.mjs";
import { hwp5ParagraphGeometry } from "./hwp5-paragraph-geometry.mjs";

// Native authoring options and selected resource define the pending display.
export function hwp5CreatedCellDisplay(table, options, shapes) {
  const shape = shapes?.find((shape) => shape.id === table.resources.paragraph);
  if (!shape || options.cell.attributes !== 0) return {};
  const insets = sourceTableCellInsets(
    { sourceGeometry: { in_margin: options.table.margins } },
    { sourceMargin: { has_margin: false } },
  );
  if (!insets) return {};
  return {
    displayFormat: "hwp5",
    displayParagraphShape: hwp5ParagraphGeometry(shape),
    displayInsets: insets,
  };
}
